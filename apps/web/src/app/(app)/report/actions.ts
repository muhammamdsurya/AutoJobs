'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@autojobs/shared/forms';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { answerAndRequeue, BankFull } from '@/lib/queue';

// RP-06: retry a Failed / Needs-action item after the user fixed the cause (answer bank, reconnect, profile).
// Not for a cancelled search: cancelling means nothing more is sent from it.
export async function retryApplication(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get('id'));
  await sql.begin(async (tx) => {
    const [a] = await tx<{ campaignId: string }[]>`update applications set status = 'queued', attempt_count = 0, scheduled_at = now(),
        failure_reason = null, pending_questions = null, locked_until = null, updated_at = now()
      where id = ${id} and user_id = ${user.id} and status in ('failed', 'needs_action')
        and campaign_id in (select id from campaigns where status <> 'cancelled') returning campaign_id`;
    if (!a) return;
    await tx`update campaigns set status = 'running' where id = ${a.campaignId} and status = 'completed'`;
    await tx`insert into application_events (application_id, event, detail) values (${id}, 'manual_retry', 'Dicoba ulang oleh pengguna')`;
  });
  revalidatePath(`/report/${id}`);
  revalidatePath('/report');
}

// Answer a question that stopped applications: saved to the answer bank (reused automatically from now on),
// and every application it unblocks goes back into the queue.
export async function answerQuestion(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const question = String(fd.get('question') ?? '').trim().slice(0, 500);
  const pattern = String(fd.get('pattern') ?? '').trim().slice(0, 300) || question;
  const picked = fd.getAll('answer').map((v) => String(v).trim()).filter(Boolean);
  const back = String(fd.get('back') ?? '');
  if (!question) return { error: 'Pertanyaan tidak dikenal.' };
  if (!picked.length) return { error: 'Isi atau pilih jawabannya dulu.' };
  // The options the portal offered for this question: a choice must be one of them.
  const [row] = await sql<{ options: string[] }[]>`select q->'options' as options
    from applications a, jsonb_array_elements(a.pending_questions) q
    where a.user_id = ${user.id} and a.status = 'needs_action' and q->>'question' = ${question} limit 1`;
  const options = row?.options ?? [];
  if (options.length && picked.some((p) => !options.includes(p))) return { error: 'Pilih salah satu jawaban yang tersedia.' };
  let result;
  try {
    result = await answerAndRequeue(user.id, { questionPattern: pattern, answer: picked.join('; '), portal: null });
  } catch (e) {
    if (e instanceof BankFull) return { error: e.message };
    throw e;
  }
  const { requeued, skipped } = result;
  revalidatePath('/profile');
  redirect(`${/^\/report(\/[0-9a-f-]{36})?$/.test(back) ? back : '/report'}?answered=${requeued}${skipped ? `&skipped=${skipped}` : ''}`);
}
