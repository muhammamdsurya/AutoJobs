import nodemailer from 'nodemailer';

// Any SMTP provider, either as SMTP_URL or Laravel-style MAIL_HOST / MAIL_PORT / MAIL_USERNAME / MAIL_PASSWORD /
// MAIL_ENCRYPTION (ssl | tls) with MAIL_FROM_ADDRESS / MAIL_FROM_NAME (e.g. Gmail with an App Password).
// Without either, emails are printed to the server log (development).
function transport() {
  const e = process.env;
  if (e.SMTP_URL) return nodemailer.createTransport(e.SMTP_URL);
  if (!e.MAIL_HOST) return null;
  const port = Number(e.MAIL_PORT || 465);
  const encryption = (e.MAIL_ENCRYPTION ?? '').toLowerCase();
  const ssl = encryption === 'ssl' || (encryption !== 'tls' && port === 465); // ssl = TLS from the start (465); tls = STARTTLS (587)
  return nodemailer.createTransport({
    host: e.MAIL_HOST,
    port,
    secure: ssl,
    requireTLS: !ssl && encryption === 'tls',
    auth: { user: e.MAIL_USERNAME, pass: (e.MAIL_PASSWORD ?? '').replace(/\s+/g, '') }, // Gmail shows App Passwords in groups of 4
  });
}

function from() {
  const e = process.env;
  if (e.MAIL_FROM) return e.MAIL_FROM;
  const address = e.MAIL_FROM_ADDRESS || e.MAIL_USERNAME;
  const name = (e.MAIL_FROM_NAME ?? '').replace(/^"|"$/g, '');
  return name ? `"${name}" <${address}>` : address;
}

// ponytail: in-memory daily cap per web process (a Gmail App Password allows about 500 a day): scripted sign-ups or
// resets can't use up the quota that real verification codes need.
const DAILY_MAX = 400;
let sentToday = { day: '', n: 0 };

export async function sendMail(to: string, subject: string, text: string) {
  const day = new Date().toISOString().slice(0, 10);
  if (sentToday.day !== day) sentToday = { day, n: 0 };
  if (++sentToday.n > DAILY_MAX) throw new Error(`batas harian ${DAILY_MAX} email tercapai`);
  const t = transport();
  if (!t) {
    // Development only: the email (with its code) in the log. In production nothing is printed: logs aren't a place
    // for one-time codes, and SMTP must be set.
    if (process.env.NODE_ENV === 'production') console.error(`[mail] SMTP belum diatur: email ke ${to} tidak terkirim`);
    else console.log(`[mail] kepada: ${to}\n[mail] subjek: ${subject}\n${text}\n`);
    return;
  }
  await t.sendMail({ from: from(), to, subject, text });
}

// Dots split the domain into parts no other quantifier can also match, so this stays linear on any input (the old
// `[^\s@]+\.[^\s@]+` backtracked quadratically: one long input could stall the server). Length is checked first anyway.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
export const validEmail = (email: string) => email.length <= 254 && EMAIL_RE.test(email);

export const appUrl = (path: string) => `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}${path}`;
