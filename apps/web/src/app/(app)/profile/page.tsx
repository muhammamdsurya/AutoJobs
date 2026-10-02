import {
  Briefcase, ChevronLeft, ChevronRight, CircleCheck, CircleUser, FileText, MessageSquareText, Search, TriangleAlert, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { Badge, Field, fmtDateTime, Notice, PageHeader } from '@autojobs/shared/ui';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { AUTO_APPLY, PORTAL_LABEL, PORTALS } from '@autojobs/shared/portals';
import { getExtras, getProfile, missingFor } from '@/lib/profile';
import { addAnswer, deleteAccount, deleteAnswer, deleteCv, saveCvSources, saveProfile, setDefaultCv, uploadCv } from './actions';

const BANK_PAGE = 10;
const EDUCATION = ['SMA/SMK', 'D3', 'D4', 'S1', 'S2', 'S3'];
const NOTICE = ['Segera', '1 minggu', '2 minggu', '1 bulan', '2 bulan', '3 bulan'];

const SECTIONS: [string, string, LucideIcon][] = [
  ['data-profesional', 'Data profesional', Briefcase],
  ['cv', 'CV', FileText],
  ['bank-jawaban', 'Bank jawaban', MessageSquareText],
  ['akun', 'Akun', CircleUser],
];

function SectionTitle({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white/6 text-accent ring-1 ring-inset ring-white/10"><Icon className="size-4.5" aria-hidden /></span>
      <div className="min-w-0">
        <h2 id={id}>{title}</h2>
        {children && <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted">{children}</p>}
      </div>
    </div>
  );
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const p = (await getProfile(user.id))!;
  const cvs = await sql<{ id: string; fileName: string; sizeBytes: number; isDefault: boolean; uploadedAt: Date }[]>`
    select id, file_name, size_bytes, is_default, uploaded_at from cv_documents where user_id = ${user.id} order by uploaded_at desc`;

  // Answer bank: searchable (pattern or answer), newest first, BANK_PAGE per page.
  const sp = await searchParams;
  const bq = (typeof sp.bq === 'string' ? sp.bq : '').trim().slice(0, 100);
  const like = `%${bq.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const bankWhere = bq ? sql`user_id = ${user.id} and (question_pattern ilike ${like} or answer ilike ${like})` : sql`user_id = ${user.id}`;
  const [{ bankTotal }] = await sql<{ bankTotal: number }[]>`select count(*)::int as bank_total from answer_bank where ${bankWhere}`;
  const bankPages = Math.max(1, Math.ceil(bankTotal / BANK_PAGE));
  const bp = Math.min(bankPages, Math.max(1, Number(sp.bp) || 1));
  const bank = await sql<{ id: string; questionPattern: string; answer: string; portal: string | null }[]>`
    select id, question_pattern, answer, portal from answer_bank where ${bankWhere}
    order by created_at desc, id limit ${BANK_PAGE} offset ${(bp - 1) * BANK_PAGE}`;
  const bankHref = (page: number) =>
    `/profile?${new URLSearchParams({ ...(bq ? { bq } : {}), ...(page > 1 ? { bp: String(page) } : {}) })}#bank-jawaban`;
  const autoPortals = PORTALS.filter((x) => AUTO_APPLY[x]);
  const extras = Object.fromEntries(await Promise.all(autoPortals.map(async (x) => [x, await getExtras(user.id, x)] as const)));
  const missing = autoPortals.map((portal) => [portal, missingFor(portal, p, extras[portal])] as const);
  const hasCv = cvs.length > 0; // one of them is always the default
  const [account] = await sql<{ createdAt: Date; hasPassword: boolean; google: boolean }[]>`
    select created_at, password_hash is not null as has_password, google_sub is not null as google from users where id = ${user.id}`;

  return (
    <>
      <PageHeader title="Profil" subtitle="Data ini dipakai untuk mengisi formulir lamaran di semua portal." />

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-24">
          <nav className="glass hidden rounded-card p-2 lg:block" aria-label="Bagian profil">
            {SECTIONS.map(([id, label, Icon]) => (
              <a key={id} href={`#${id}`} className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-muted no-underline transition-colors hover:bg-white/6 hover:text-ink hover:no-underline">
                <Icon className="size-4" aria-hidden />{label}
              </a>
            ))}
          </nav>
          <section className="card" aria-labelledby="kelengkapan">
            <h2 id="kelengkapan" className="text-base">Kelengkapan per portal</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {missing.map(([portal, m]) => (
                <li key={portal} className="flex gap-2.5">
                  {m.length
                    ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
                    : <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
                  <div className="min-w-0">
                    <p className="font-medium">{PORTAL_LABEL[portal]}</p>
                    <p className={`text-xs leading-relaxed ${m.length ? 'text-amber-200' : 'text-muted'}`}>{m.length ? `Belum lengkap: ${m.join(', ')}` : 'Lengkap'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="min-w-0 space-y-6">
          <ActionForm action={saveProfile} className="space-y-6">
            <section className="card scroll-mt-24" id="data-profesional" aria-labelledby="h-data-profesional">
              <SectionTitle id="h-data-profesional" icon={Briefcase} title="Data profesional">
                Untuk menjawab otomatis pertanyaan penyaringan saat melamar, seperti lama pengalaman, pendidikan, keahlian, dan gaji. Nama, nomor HP,
                dan alamat tidak perlu diisi di sini: portal mengisinya dari akun Anda di sana.
              </SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Jabatan saat ini"><input className="input" name="currentTitle" defaultValue={p.currentTitle} /></Field>
                <Field label="Total pengalaman kerja (tahun)"><input className="input num" name="yearsExperience" type="number" min={0} max={60} step={0.5} defaultValue={p.yearsExperience ?? ''} /></Field>
                <Field label="Pendidikan terakhir">
                  <select className="input" name="educationLevel" defaultValue={p.educationLevel}>
                    <option value="">Pilih</option>
                    {EDUCATION.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Jurusan"><input className="input" name="educationMajor" defaultValue={p.educationMajor} /></Field>
                <Field label="Keahlian" hint="Pisahkan dengan koma, mis. SQL, Excel, Tableau" className="sm:col-span-2">
                  <input className="input" name="skills" defaultValue={p.skills.join(', ')} />
                </Field>
                <Field label="Gaji yang diharapkan (Rp/bulan)"><input className="input num" name="expectedSalaryMin" inputMode="numeric" defaultValue={p.expectedSalaryMin ?? ''} placeholder="7000000" /></Field>
                <Field label="Masa pemberitahuan (notice period)">
                  <select className="input" name="noticePeriod" defaultValue={p.noticePeriod}>
                    <option value="">Pilih</option>
                    {NOTICE.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="URL LinkedIn"><input className="input" name="linkedinUrl" type="url" defaultValue={p.linkedinUrl} placeholder="https://www.linkedin.com/in/…" /></Field>
                <Field label="URL portofolio"><input className="input" name="portfolioUrl" type="url" defaultValue={p.portfolioUrl} placeholder="https://…" /></Field>
                <label className="chip-toggle w-fit">
                  <input type="checkbox" name="willingToRelocate" defaultChecked={p.willingToRelocate} className="accent-accent" />Bersedia pindah domisili
                </label>
              </div>
            </section>
            <div className="flex justify-end [&>button]:w-full sm:[&>button]:w-auto">
              <Submit>Simpan profil</Submit>
            </div>
          </ActionForm>

          <section className="card scroll-mt-24" id="cv" aria-labelledby="h-cv">
            <SectionTitle id="h-cv" icon={FileText} title="CV">
              PDF, maksimal 5 MB: JobStreet, Glints, dan LinkedIn hanya menerima PDF. CV default dipakai untuk pencarian baru. File disimpan terenkripsi.
            </SectionTitle>
            {cvs.length > 0 && (
              <ul className="glass-dense mb-4 divide-y divide-white/6 overflow-hidden rounded-control text-sm">
                {cvs.map((cv) => (
                  <li key={cv.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <a href={`/api/files/cv/${cv.id}`} className="break-all">{cv.fileName}</a>
                        {cv.isDefault && <Badge tone="green"><CircleCheck aria-hidden />default</Badge>}
                      </span>
                      <span className="text-xs tabular-nums text-muted">{Math.max(1, Math.round(cv.sizeBytes / 1024))} KB · {fmtDateTime(cv.uploadedAt)}</span>
                    </div>
                    <span className="flex gap-2">
                      {!cv.isDefault && (
                        <form action={setDefaultCv}><input type="hidden" name="id" value={cv.id} /><button className="btn btn-secondary">Jadikan default</button></form>
                      )}
                      <form action={deleteCv}><input type="hidden" name="id" value={cv.id} /><Submit className="btn btn-danger" confirm="Hapus CV ini?">Hapus</Submit></form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={uploadCv} className="flex flex-col gap-3 sm:flex-row sm:items-center" resetOnOk>
              <input type="file" name="cv" accept=".pdf,application/pdf" required aria-label="File CV (PDF)"
                className="min-w-0 flex-1 text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-white/12 file:bg-white/6 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-white/10" />
              <Submit className="btn btn-secondary">Unggah CV</Submit>
            </ActionForm>

            {/* Keyed on having a CV: the first upload / last delete re-renders the radios with their new default. */}
            <ActionForm key={String(hasCv)} action={saveCvSources} className="mt-6 space-y-4 border-t border-white/8 pt-5">
              <div>
                <h3 className="font-sans text-sm font-semibold">CV yang dipakai saat melamar</h3>
                <p className="hint">
                  {hasCv
                    ? <>&quot;CV di portal&quot;: CV yang sudah tersimpan di akun portal itu yang dipilih. Bila portal tidak menampilkan CV tersimpan saat
                      melamar, CV default AutoJobs diunggah sebagai cadangan.</>
                    : <>Belum ada CV AutoJobs, jadi semua portal memakai CV yang tersimpan di akun portal masing-masing. Pastikan akun portal Anda
                      sudah punya CV, atau unggah CV PDF di atas untuk bisa memilih CV AutoJobs.</>}
                </p>
              </div>
              <ul className="space-y-3">
                {autoPortals.map((portal) => {
                  const fromPortal = !hasCv || extras[portal].cv_source === 'portal';
                  return (
                    <li key={portal} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="w-24 text-sm font-medium">{PORTAL_LABEL[portal]}</span>
                      <div className="inline-flex flex-wrap rounded-control border border-white/12 bg-white/4 p-1 text-sm" role="radiogroup" aria-label={`CV untuk ${PORTAL_LABEL[portal]}`}>
                        {([['autojobs', 'CV AutoJobs'], ['portal', `CV di ${PORTAL_LABEL[portal]}`]] as const).map(([v, label]) => (
                          <label key={v} className="flex cursor-pointer items-center gap-2 rounded-chip px-3 py-1.5 text-muted transition-colors has-[:checked]:bg-accent/15 has-[:checked]:text-teal-100 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                            <input type="radio" name={`cv_${portal}`} value={v} defaultChecked={fromPortal === (v === 'portal')}
                              disabled={v === 'autojobs' && !hasCv} className="accent-accent" />
                            {label}
                          </label>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {/* Without an AutoJobs CV there's nothing to choose: saving would only pin every portal to its own CV. */}
              {hasCv && <Submit className="btn btn-secondary">Simpan pilihan CV</Submit>}
            </ActionForm>
          </section>

          <section className="card scroll-mt-24" id="bank-jawaban" aria-labelledby="h-bank">
            <SectionTitle id="h-bank" icon={MessageSquareText} title="Bank jawaban">
              Jawaban untuk pertanyaan penyaringan dari perusahaan. Sebuah pola cocok bila <b className="text-ink">semua katanya</b> ada di pertanyaan
              (mis. pola <i>pengalaman SQL</i> cocok dengan &quot;Berapa tahun pengalaman kamu dengan SQL?&quot;). Pola yang paling spesifik dipakai.
              Pertanyaan wajib yang tidak cocok dengan pola apa pun <b className="text-ink">tidak ditebak</b>: lamaran berhenti dengan status &quot;Perlu tindakan&quot;.
            </SectionTitle>
            {(bankTotal > 0 || bq) && (
              <form method="get" action="/profile#bank-jawaban" role="search" className="mb-3 flex flex-wrap gap-2">
                <input type="search" name="bq" defaultValue={bq} className="input min-w-0 flex-1 basis-56" placeholder="Cari pola pertanyaan atau jawaban" aria-label="Cari di bank jawaban" />
                <button className="btn btn-secondary"><Search aria-hidden />Cari</button>
                {bq && <Link href="/profile#bank-jawaban" className="btn btn-quiet">Reset</Link>}
              </form>
            )}
            {bankTotal > 0 && (
              <p className="mb-2 text-xs text-muted">
                <span className="num text-ink">{bankTotal}</span> jawaban{bq && <> cocok dengan &quot;{bq}&quot;</>}
                {bankPages > 1 && <>, menampilkan <span className="num">{(bp - 1) * BANK_PAGE + 1}-{Math.min(bp * BANK_PAGE, bankTotal)}</span></>}
              </p>
            )}
            {bankTotal === 0 ? (
              bq ? (
                <p className="rounded-control border border-white/8 bg-white/4 px-4 py-6 text-center text-sm text-muted">
                  Tidak ada jawaban yang cocok dengan &quot;{bq}&quot;. <Link href="/profile#bank-jawaban">Tampilkan semua</Link>
                </p>
              ) : (
                <Notice tone="blue">Belum ada jawaban. Contoh: pola <i>tahun pengalaman analis data</i> → jawaban <i>3</i>; pola <i>bersedia ditempatkan</i> → <i>Ya</i>.</Notice>
              )
            ) : (
              <ul className="glass-dense divide-y divide-white/6 overflow-hidden rounded-control text-sm">
                {bank.map((b) => (
                  <li key={b.id} className="grid gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                    <p className="text-muted">{b.questionPattern}</p>
                    <p className="whitespace-pre-wrap font-medium">{b.answer}</p>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <Badge>{b.portal ? PORTAL_LABEL[b.portal as keyof typeof PORTAL_LABEL] : 'Semua portal'}</Badge>
                      <form action={deleteAnswer}>
                        <input type="hidden" name="id" value={b.id} />
                        <button className="btn btn-quiet min-h-9 px-2.5 text-rose-300 hover:text-rose-200 sm:min-h-9" aria-label={`Hapus jawaban untuk pola ${b.questionPattern}`}>Hapus</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {bankPages > 1 && (
              <nav className="mt-3 flex items-center justify-between gap-3 text-sm" aria-label="Halaman bank jawaban">
                {bp > 1 ? <Link href={bankHref(bp - 1)} className="btn btn-secondary"><ChevronLeft aria-hidden />Sebelumnya</Link> : <span />}
                <span className="text-muted">Halaman <span className="num text-ink">{bp}</span> dari <span className="num text-ink">{bankPages}</span></span>
                {bp < bankPages ? <Link href={bankHref(bp + 1)} className="btn btn-secondary">Berikutnya<ChevronRight aria-hidden /></Link> : <span />}
              </nav>
            )}
            <ActionForm action={addAnswer} className="mt-5 border-t border-white/8 pt-5" resetOnOk>
              <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
                <Field label="Pola pertanyaan"><input className="input" name="pattern" placeholder="tahun pengalaman SQL" required /></Field>
                <Field label="Jawaban"><input className="input" name="answer" placeholder="3" required /></Field>
                <Field label="Portal">
                  <select className="input" name="portal" defaultValue="">
                    <option value="">Semua</option>
                    {PORTALS.map((x) => <option key={x} value={x}>{PORTAL_LABEL[x]}</option>)}
                  </select>
                </Field>
                <Submit className="btn btn-secondary">Tambah</Submit>
              </div>
              <p className="hint">Untuk pilihan ganda tulis teks pilihannya; beberapa pilihan pisahkan dengan titik koma.</p>
            </ActionForm>
          </section>

          <section className="card scroll-mt-24" id="akun" aria-labelledby="h-akun">
            <SectionTitle id="h-akun" icon={CircleUser} title="Akun" />
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              {([
                ['Email', user.email],
                ['Cara masuk', [account.hasPassword && 'email & kata sandi', account.google && 'akun Google'].filter(Boolean).join(' atau ') || '-'],
                ['Terdaftar', fmtDateTime(account.createdAt)],
              ] as const).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 break-words tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-6 rounded-card border border-rose-300/25 bg-rose-400/[0.04] p-4 sm:p-5">
              <h3 className="flex items-center gap-2 font-sans text-base font-semibold text-rose-200"><TriangleAlert className="size-4.5" aria-hidden />Hapus akun</h3>
              <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted">
                Menghapus akun, profil, CV, pencarian, laporan, pasangan ekstensi, semua bukti lamaran, sisa token, dan riwayat pembayaran secara permanen.
                Tindakan ini tidak bisa dibatalkan.
              </p>
              <ActionForm action={deleteAccount} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                {account.hasPassword
                  ? <Field label="Kata sandi untuk konfirmasi" className="sm:w-80"><input className="input" type="password" name="password" autoComplete="current-password" required /></Field>
                  : <Field label="Ketik email Anda untuk konfirmasi" className="sm:w-80"><input className="input" type="email" name="confirmEmail" autoComplete="off" required /></Field>}
                <Submit className="btn btn-danger" confirm="Hapus akun dan semua data secara permanen?">Hapus akun permanen</Submit>
              </ActionForm>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
