'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@autojobs/shared/forms';
import { requireUser } from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import { createPairingCode } from '@/lib/extension';
import { isPortal, PORTAL_FIELDS, type Portal } from '@autojobs/shared/portals';

export async function savePortalFields(portal: Portal, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isPortal(portal)) return { error: 'Portal tidak dikenal.' };
  for (const f of PORTAL_FIELDS[portal]) {
    let value = String(fd.get(f.key) ?? '').trim().slice(0, 5000);
    if (f.type === 'number') value = value.replace(/[^\d]/g, '');
    if (value) {
      await sql`insert into portal_extra_fields (user_id, portal, field_key, value) values (${user.id}, ${portal}, ${f.key}, ${value})
        on conflict (user_id, portal, field_key) do update set value = excluded.value`;
    } else {
      await sql`delete from portal_extra_fields where user_id = ${user.id} and portal = ${portal} and field_key = ${f.key}`;
    }
  }
  revalidatePath('/connections');
  return { ok: 'Tersimpan.' };
}

export async function newPairingCode(_: FormState): Promise<FormState> {
  const user = await requireUser();
  const code = await createPairingCode(user.id);
  return { ok: `Kode pairing: ${code}. Berlaku 10 menit, sekali pakai.` };
}

export async function unpairAll() {
  const user = await requireUser();
  await sql`delete from extension_tokens where user_id = ${user.id}`;
  await sql`update portal_accounts set status = 'expired' where user_id = ${user.id}`;
  await audit(user.id, 'extension_unpaired_all');
  revalidatePath('/connections');
}
