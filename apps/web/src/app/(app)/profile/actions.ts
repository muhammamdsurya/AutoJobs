'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@autojobs/shared/forms';
import { endSession, requireUser, verifyPassword } from '@autojobs/shared/auth';
import { deleteFile, saveFile } from '@autojobs/shared/crypto';
import { audit, sql } from '@autojobs/shared/db';
import { AUTO_APPLY, isPortal, PORTALS } from '@autojobs/shared/portals';
import { answerAndRequeue, BankFull } from '@/lib/queue';

const MAX_CV = 5 * 1024 * 1024; // PR-02
const MAX_CVS = 5; // per account: storage on the server is shared by everyone
const text = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? '').trim().slice(0, max);
const num = (fd: FormData, k: string) => {
  const v = text(fd, k).replace(/[^\d.]/g, '');
  return v === '' ? null : Number(v);
};
// A message meant for the user (anything else thrown is logged, and the user sees a general message).
class InputError extends Error {}
const url = (fd: FormData, k: string) => {
  const v = text(fd, k, 300);
  if (v && !/^https?:\/\/\S+$/i.test(v)) throw new InputError(`Tautan "${v}" harus diawali http:// atau https://`);
  return v;
};

// Only the fields the Profile page shows (see lib/profile.ts); name, phone, address etc. are the portals' to fill.
export async function saveProfile(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const row = {
      linkedinUrl: url(fd, 'linkedinUrl'), portfolioUrl: url(fd, 'portfolioUrl'),
      currentTitle: text(fd, 'currentTitle'), yearsExperience: num(fd, 'yearsExperience'), educationLevel: text(fd, 'educationLevel', 20),
      educationMajor: text(fd, 'educationMajor'),
      skills: text(fd, 'skills', 2000).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50),
      expectedSalaryMin: num(fd, 'expectedSalaryMin'), noticePeriod: text(fd, 'noticePeriod', 40),
      willingToRelocate: fd.get('willingToRelocate') === 'on',
    };
    await sql`update candidate_profiles set ${sql(row)}, updated_at = now() where user_id = ${user.id}`;
    revalidatePath('/profile');
    return { ok: 'Profil tersimpan.' };
  } catch (e) {
    if (e instanceof InputError) return { error: e.message };
    console.error('[profile]', e);
    return { error: 'Gagal menyimpan profil. Coba lagi.' };
  }
}

// Per portal: the AutoJobs CV, or the CV the user already saved on that portal (portal_extra_fields cv_source).
export async function saveCvSources(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  for (const portal of PORTALS.filter((p) => AUTO_APPLY[p])) {
    if (fd.get(`cv_${portal}`) === 'portal')
      await sql`insert into portal_extra_fields (user_id, portal, field_key, value) values (${user.id}, ${portal}, 'cv_source', 'portal')
        on conflict (user_id, portal, field_key) do update set value = excluded.value`;
    else await sql`delete from portal_extra_fields where user_id = ${user.id} and portal = ${portal} and field_key = 'cv_source'`;
  }
  revalidatePath('/profile');
  return { ok: 'Pilihan CV tersimpan.' };
}

// Privacy (UU PDP): the user can delete all their data. Rows cascade from users; encrypted files are removed from disk.
export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const [u] = await sql<{ passwordHash: string | null }[]>`select password_hash from users where id = ${user.id}`;
  if (u.passwordHash) {
    if (!(await verifyPassword(String(fd.get('password') ?? ''), u.passwordHash))) return { error: 'Kata sandi salah.' };
  } else if (String(fd.get('confirmEmail') ?? '').trim().toLowerCase() !== user.email.toLowerCase()) {
    return { error: 'Ketik email akun Anda persis untuk konfirmasi.' }; // account made with Google: no password
  }
  const files = await sql<{ k: string }[]>`
    select file_key as k from cv_documents where user_id = ${user.id}
    union all select screenshot_key from applications where user_id = ${user.id} and screenshot_key is not null
    union all select proof_key from topups where user_id = ${user.id} and proof_key is not null
    union all select e.file_key from application_events e join applications a on a.id = e.application_id
      where a.user_id = ${user.id} and e.file_key is not null`;
  await sql`delete from users where id = ${user.id}`;
  for (const { k } of files) await deleteFile(k);
  await audit(null, 'account_deleted', { userId: user.id });
  await endSession();
  redirect('/signup');
}

// PDF only (checked by content, not just the name): JobStreet, Glints and LinkedIn take PDF resumes. Max 5 MB, stored encrypted.
export async function uploadCv(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = fd.get('cv');
  if (!(file instanceof File) || file.size === 0) return { error: 'Pilih file CV terlebih dulu.' };
  if (file.size > MAX_CV) return { error: 'Ukuran CV maksimal 5 MB.' };
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-' || !/\.pdf$/i.test(name))
    return { error: 'CV harus berupa file PDF: JobStreet, Glints, dan LinkedIn hanya menerima PDF.' };
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from cv_documents where user_id = ${user.id}`;
  if (count >= MAX_CVS) return { error: `Maksimal ${MAX_CVS} CV. Hapus CV lama yang tidak dipakai dulu.` };
  const key = await saveFile(buf);
  await sql`insert into cv_documents (user_id, file_key, file_name, mime, size_bytes, is_default)
    values (${user.id}, ${key}, ${name}, 'application/pdf', ${buf.length}, ${count === 0})`;
  await audit(user.id, 'cv_uploaded', { name });
  revalidatePath('/profile');
  return { ok: `CV "${name}" terunggah${count === 0 ? ' dan dijadikan default' : ''}.` };
}

export async function setDefaultCv(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get('id'));
  await sql.begin(async (tx) => {
    const [cv] = await tx`select id from cv_documents where id = ${id} and user_id = ${user.id}`;
    if (!cv) return;
    await tx`update cv_documents set is_default = false where user_id = ${user.id} and is_default`;
    await tx`update cv_documents set is_default = true where id = ${id}`;
  });
  revalidatePath('/profile');
}

export async function deleteCv(fd: FormData) {
  const user = await requireUser();
  const [cv] = await sql<{ fileKey: string; isDefault: boolean }[]>`delete from cv_documents where id = ${String(fd.get('id'))} and user_id = ${user.id} returning file_key, is_default`;
  if (!cv) return;
  await deleteFile(cv.fileKey);
  if (cv.isDefault)
    await sql`update cv_documents set is_default = true where id = (select id from cv_documents where user_id = ${user.id} order by uploaded_at desc limit 1)`;
  await audit(user.id, 'cv_deleted');
  revalidatePath('/profile');
}

export async function addAnswer(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const pattern = text(fd, 'pattern', 300);
  const answer = text(fd, 'answer', 2000);
  const portal = text(fd, 'portal', 20);
  if (!pattern || !answer) return { error: 'Isi pola pertanyaan dan jawabannya.' };
  // Same path as answering in Laporan: one row per question, and applications waiting for it go back into the queue.
  let result;
  try {
    result = await answerAndRequeue(user.id, { questionPattern: pattern, answer, portal: isPortal(portal) ? portal : null });
  } catch (e) {
    if (e instanceof BankFull) return { error: e.message };
    throw e;
  }
  const { added, requeued } = result;
  revalidatePath('/profile');
  revalidatePath('/report');
  const done = added ? 'Jawaban ditambahkan.' : 'Pola ini sudah ada di bank jawaban; jawabannya diperbarui.';
  return { ok: requeued ? `${done} ${requeued} lamaran yang tertahan diantrekan ulang.` : done };
}

export async function deleteAnswer(fd: FormData) {
  const user = await requireUser();
  await sql`delete from answer_bank where id = ${String(fd.get('id'))} and user_id = ${user.id}`;
  revalidatePath('/profile');
}
