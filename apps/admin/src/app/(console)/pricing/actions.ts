'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@autojobs/shared/auth';
import { audit, sql } from '@autojobs/shared/db';
import type { FormState } from '@autojobs/shared/forms';

// Same bounds as the token_packs checks (migration 013). From Rp1 (e.g. a test pack): a price too small for a unique
// code is paid exactly, by one buyer at a time.
function parse(fd: FormData) {
  const tokens = Math.trunc(Number(fd.get('tokens')));
  const price = Math.trunc(Number(String(fd.get('price') ?? '').replace(/\D/g, '')));
  if (!(tokens >= 1 && tokens <= 1000)) return { error: 'Jumlah token antara 1 dan 1000.' };
  if (!(price >= 1 && price <= 10_000_000)) return { error: 'Harga antara Rp1 dan Rp10.000.000.' };
  return { tokens, price };
}

// The app's landing and Token pages read the packs on every request, so a change shows there at once.
export async function createPack(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(fd);
  if ('error' in p) return p;
  const [dup] = await sql`select 1 from token_packs where active and tokens = ${p.tokens} and price = ${p.price}`;
  if (dup) return { error: 'Paket dengan token dan harga yang sama sudah dijual.' };
  await sql`insert into token_packs (tokens, price) values (${p.tokens}, ${p.price})`;
  await audit(null, 'pack_created', p, admin.id);
  revalidatePath('/pricing');
  return { ok: `Paket ${p.tokens} token ditambahkan dan langsung dijual.` };
}

// Changes apply to new purchases; purchases already started keep their own price.
export async function updatePack(id: number, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parse(fd);
  if ('error' in p) return p;
  const active = fd.get('active') === 'on';
  const [before] = await sql<{ tokens: number; price: number; active: boolean }[]>`select tokens, price, active from token_packs where id = ${id}`;
  if (!before) return { error: 'Paket tidak ditemukan.' };
  await sql`update token_packs set tokens = ${p.tokens}, price = ${p.price}, active = ${active} where id = ${id}`;
  await audit(null, 'pack_updated', { before, after: { ...p, active } }, admin.id);
  revalidatePath('/pricing');
  return { ok: active ? 'Tersimpan.' : 'Tersimpan. Paket disembunyikan dari pengguna.' };
}
