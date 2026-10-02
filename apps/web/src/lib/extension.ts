// Server side of the AutoJobs browser extension: pairing, token auth, and page loads done in the user's browser.
import { randomInt } from 'node:crypto';
import type { Loader } from './adapters';
import { randomToken, sha256 } from '@autojobs/shared/crypto';
import { audit, sql } from '@autojobs/shared/db';
import { listening, notify, waitFor } from './notify';

// Bearer-token API, called from the extension's background worker (origin chrome-extension://…), never with cookies.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

// null: not paired (the extension forgets its token on 401). 'suspended': paired, but an admin suspended the account;
// answered with 403, so the extension keeps its pairing and the queue resumes once the account is reinstated.
export async function extensionUserId(req: Request): Promise<string | 'suspended' | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  // A token unused for 60 days has expired (a forgotten or stolen browser): the extension then asks to pair again.
  const [row] = await sql<{ userId: string; suspended: boolean }[]>`update extension_tokens t set last_seen_at = now() from users u
    where t.token_hash = ${sha256(token)} and u.id = t.user_id and t.last_seen_at > now() - interval '60 days'
    returning t.user_id, u.suspended_at is not null as suspended`;
  return row?.suspended ? 'suspended' : (row?.userId ?? null);
}
export const notAllowed = (userId: string | null) =>
  userId === 'suspended' ? json({ error: 'Akun AutoJobs Anda ditangguhkan admin.' }, 403) : json({ error: 'Ekstensi belum dipasangkan.' }, 401);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

// Shown on the Connections page and typed into the extension popup; valid 10 minutes, single use.
export async function createPairingCode(userId: string) {
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  await sql`delete from pairing_codes where user_id = ${userId}`;
  await sql`insert into pairing_codes (code_hash, user_id, expires_at) values (${sha256(code)}, ${userId}, now() + interval '10 minutes')`;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function redeemPairingCode(code: string, ip: string): Promise<{ token: string; email: string } | null> {
  const [row] = await sql<{ userId: string; email: string }[]>`
    delete from pairing_codes p using users u
    where p.code_hash = ${sha256(normalizeCode(code))} and p.expires_at > now() and u.id = p.user_id
    returning p.user_id, u.email`;
  if (!row) return null;
  const token = randomToken();
  await sql`insert into extension_tokens (token_hash, user_id, last_seen_at) values (${sha256(token)}, ${row.userId}, now())`;
  await audit(row.userId, 'extension_paired', { ip }); // a token that can read the CV and answers: on record
  return { token, email: row.email };
}

// The extension polls every ~30 s, so "seen in the last 2 minutes" means it's running.
export async function extensionLastSeen(userId: string): Promise<Date | null> {
  const [row] = await sql<{ lastSeen: Date | null }[]>`select max(last_seen_at) as last_seen from extension_tokens where user_id = ${userId}`;
  return row?.lastSeen ?? null;
}
export const isOnline = (lastSeen: Date | null) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 2 * 60_000;

export class ExtensionUnavailable extends Error {}

// Loader for portals that only answer the user's own verified browser (Glints): the worker queues the URL,
// the extension loads it in the user's Chrome and posts the HTML back.
export function extensionLoader(userId: string, portalLabel: string): Loader {
  return async (url) => {
    await listening();
    const [{ id }] = await sql<{ id: string }[]>`insert into browser_fetches (user_id, url) values (${userId}, ${url}) returning id`;
    await notify(`fetch-new:${userId}`); // wakes this user's extension if it's waiting for work
    try {
      for (const deadline = Date.now() + 5 * 60_000; Date.now() < deadline; ) {
        // Woken the moment the page is back; the timeout re-checks in case a notification was missed.
        const done = waitFor(`fetch-done:${id}`, 5000);
        const [r] = await sql<{ status: string; body: string | null; error: string | null; createdAt: Date }[]>`
          select status, body, error, created_at from browser_fetches where id = ${id}`;
        if (r.status === 'done') return r.body ?? '';
        if (r.status === 'failed') throw new Error(r.error ?? `Gagal memuat halaman ${portalLabel}`);
        // Nobody picked it up: the extension isn't running.
        if (r.status === 'pending' && Date.now() - new Date(r.createdAt).getTime() > 90_000)
          throw new ExtensionUnavailable(`Ekstensi AutoJobs tidak aktif. Buka Chrome di komputer yang ekstensinya sudah dipasangkan, lalu cari ulang.`);
        await done;
      }
      throw new Error(`Halaman ${portalLabel} tidak selesai dimuat dalam 5 menit`);
    } finally {
      await sql`delete from browser_fetches where id = ${id}`;
    }
  };
}

// ponytail: in-memory guard against pairing-code guessing, per web process
const attempts = new Map<string, number[]>();
export function pairingThrottled(key: string) {
  if (attempts.size > 10_000) for (const [k, ts] of attempts) if (Date.now() - ts[ts.length - 1] > 15 * 60_000) attempts.delete(k);
  const recent = (attempts.get(key) ?? []).filter((t) => Date.now() - t < 15 * 60_000);
  recent.push(Date.now());
  attempts.set(key, recent);
  return recent.length > 20;
}
