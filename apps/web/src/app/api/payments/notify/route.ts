import { audit } from '@autojobs/shared/db';
import { checkHookKey, receiveNotification } from '@autojobs/shared/payments';

// MacroDroid on the merchant's Android phone posts each DANA Bisnis "payment received" notification here, plus a
// "ping" every 15 minutes. The key is made in the admin console (Pengaturan → Notifikasi DANA); it goes in the
// Authorization: Bearer header, or as ?key= when the app can't set headers.
let lastRejected = 0;

export async function POST(req: Request) {
  const key = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? new URL(req.url).searchParams.get('key') ?? '';
  if (!(await checkHookKey(key))) {
    // On record (someone has the wrong key, or is guessing), at most once a minute so it can't flood the audit log.
    if (Date.now() - lastRejected > 60_000) {
      lastRejected = Date.now();
      await audit(null, 'notify_rejected', { ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local' });
    }
    return Response.json({ error: 'Kunci tidak valid' }, { status: 401 });
  }
  const body = (await req.text()).slice(0, 8000);
  return Response.json({ result: await receiveNotification(textOf(body, req.headers.get('content-type') ?? '')) });
}

// Whatever MacroDroid sends: plain text, a form, or JSON (all its text values, e.g. title + text). Plain text labelled
// as a form (many HTTP clients' default) parses as one key with no value, so a key without a value counts as text.
function textOf(body: string, type: string) {
  if (type.includes('x-www-form-urlencoded')) return [...new URLSearchParams(body)].map(([k, v]) => v || k).join(' ');
  if (type.includes('json')) {
    try {
      const v: unknown = JSON.parse(body);
      return typeof v === 'string' ? v : Object.values(v ?? {}).filter((x) => typeof x === 'string').join(' ');
    } catch {
      // not JSON after all: use it as text
    }
  }
  return body;
}
