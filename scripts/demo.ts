// Demo account with sample data (fictional companies and people), for UI review and the landing-page screenshot.
//   npx tsx --env-file=.env scripts/demo.ts seed    → creates it and prints a session token (cookie "sid")
//   npx tsx --env-file=.env scripts/demo.ts clean   → removes it again
// Never touches other accounts.
import { randomToken, sha256 } from '@autojobs/shared/crypto';
import { sql } from '@autojobs/shared/db';

const EMAIL = 'demo@autojobs.test';

async function clean() {
  await sql`delete from users where email = ${EMAIL}`;
  await sql`delete from job_listings where external_id like 'demo-%'`;
}

type L = { portal: 'jobstreet' | 'glints' | 'linkedin'; title: string; company: string; location: string; salary: string; levels: string[]; reason: string; questions?: string[]; external?: boolean };

const READY: L[] = [
  { portal: 'jobstreet', title: 'Data Analyst', company: 'PT Rimba Data Analitika', location: 'Jakarta Selatan, Jakarta Raya', salary: 'Rp 8.000.000 - Rp 11.000.000 per bulan', levels: ['junior'], reason: 'judul cocok "data analyst" · deskripsi memuat SQL, Power BI · level Junior (1-3 thn)', questions: ['Berapa tahun pengalaman kerjamu sebagai Data Analyst?', 'Berapa gaji bulanan yang kamu inginkan?'] },
  { portal: 'jobstreet', title: 'Business Intelligence Analyst', company: 'PT Kirana Retail Indonesia', location: 'Tangerang, Banten', salary: 'Rp 9.500.000 - Rp 13.000.000 per bulan', levels: ['mid'], reason: 'judul cocok "business intelligence" · deskripsi memuat SQL · level Mid (3-5 thn)' },
  { portal: 'glints', title: 'Junior Data Analyst', company: 'PT Samudra Logistik Pratama', location: 'Jakarta Utara, DKI Jakarta', salary: 'Rp 6.500.000 - Rp 8.000.000 per bulan', levels: ['entry', 'junior'], reason: 'judul cocok "data analyst" · deskripsi memuat SQL · level Entry (0-1 thn) / Junior (1-3 thn)', questions: ['Apakah kamu tinggal di Jakarta Utara pada saat ini?'] },
  { portal: 'glints', title: 'Data Analyst (Supply Chain)', company: 'PT Cakra Pangan Nusantara', location: 'Bekasi, Jawa Barat', salary: '', levels: [], reason: 'judul cocok "data analyst" · deskripsi memuat Power BI · level pengalaman tidak diketahui' },
  { portal: 'linkedin', title: 'Analis Data Keuangan', company: 'PT Tirta Finansial Digital', location: 'Jakarta, Indonesia', salary: '', levels: ['junior'], reason: 'judul cocok "analis data" · deskripsi memuat SQL, Python · level Junior (1-3 thn)', questions: ['How many years of work experience do you have with SQL?', 'Are you comfortable commuting to this job\'s location?'] },
  { portal: 'linkedin', title: 'BI Developer', company: 'PT Lentera Edukasi Bangsa', location: 'Bandung, Jawa Barat', salary: '', levels: ['mid'], reason: 'judul cocok "bi developer" · deskripsi memuat SQL · level Mid (3-5 thn)', external: true },
];

const RUNNING: (L & { status: string; failure?: string; minutesAgo: number })[] = [
  { portal: 'jobstreet', title: 'Data Analyst', company: 'PT Arunika Solusi Digital', location: 'Jakarta Pusat', salary: '', levels: ['junior'], reason: 'judul cocok "data analyst"', status: 'submitted', minutesAgo: 3 },
  { portal: 'glints', title: 'Data Analyst Staff', company: 'PT Baskara Media Kreasi', location: 'Jakarta Barat', salary: '', levels: ['junior'], reason: 'judul cocok "data analyst"', status: 'submitted', minutesAgo: 4 },
  { portal: 'linkedin', title: 'Reporting Analyst', company: 'PT Merapi Energi Terbarukan', location: 'Jakarta, Indonesia', salary: '', levels: ['junior'], reason: 'judul cocok "analyst"', status: 'needs_action', failure: 'Pertanyaan belum ada di bank jawaban: "How many years of work experience do you have with Tableau?"', minutesAgo: 5 },
  { portal: 'jobstreet', title: 'Junior Business Analyst', company: 'PT Nirmala Klinik Sehat', location: 'Depok, Jawa Barat', salary: '', levels: ['entry'], reason: 'judul cocok "business analyst"', status: 'submitted', minutesAgo: 9 },
  { portal: 'glints', title: 'Data Analyst Intern', company: 'PT Gemilang Agro Lestari', location: 'Bogor, Jawa Barat', salary: '', levels: ['entry'], reason: 'judul cocok "data analyst"', status: 'failed', failure: 'Lowongan sudah ditutup di portal.', minutesAgo: 11 },
  { portal: 'jobstreet', title: 'Data Quality Analyst', company: 'PT Sentosa Asuransi Jiwa', location: 'Jakarta Selatan', salary: '', levels: ['mid'], reason: 'judul cocok "analyst"', status: 'queued', minutesAgo: 1 },
  { portal: 'glints', title: 'Marketing Data Analyst', company: 'PT Kopi Senja Nusantara', location: 'Jakarta Selatan', salary: '', levels: ['junior'], reason: 'judul cocok "data analyst"', status: 'queued', minutesAgo: 1 },
  { portal: 'linkedin', title: 'Product Data Analyst', company: 'PT Laju Mobilitas Indonesia', location: 'Jakarta, Indonesia', salary: '', levels: ['mid'], reason: 'judul cocok "data analyst"', status: 'queued', minutesAgo: 1 },
];

async function listing(l: L, i: number, prefix: string) {
  const [row] = await sql<{ id: string }[]>`insert into job_listings (portal, external_id, url, title, company, location, salary_text, questions, apply_method, posted_at)
    values (${l.portal}, ${`demo-${prefix}-${i}`}, ${`https://example.com/lowongan/${prefix}-${i}`}, ${l.title}, ${l.company}, ${l.location}, ${l.salary},
      ${l.questions ?? []}, ${l.external ? 'external' : 'portal_apply'}, now() - ${i} * interval '1 day') returning id`;
  return row.id;
}

async function seed() {
  await clean();
  const [u] = await sql<{ id: string }[]>`insert into users (email, password_hash, role, consent_at, email_verified_at)
    values (${EMAIL}, null, 'user', now(), now()) returning id`;
  await sql`insert into candidate_profiles (user_id, full_name, email, phone_country, phone, city, current_title, years_experience, education_level, skills, expected_salary_min, notice_period)
    values (${u.id}, 'Rani Kusumawardani', ${EMAIL}, '+62', '81298471063', 'Jakarta Selatan', 'Data Analyst', 2.5, 'S1', ${['SQL', 'Python', 'Power BI', 'Excel']}, 8000000, '1 bulan')`;
  for (const p of ['jobstreet', 'glints', 'linkedin'])
    await sql`insert into portal_accounts (user_id, portal, status, last_verified_at, next_apply_at) values (${u.id}, ${p}, 'connected', now(), now() + interval '17 seconds')`;

  const summary = {
    jobstreet: { status: 'done', found: 50, matched: 2, rejected: { title: 41, experience: 5, applied: 2 } },
    glints: { status: 'done', found: 38, matched: 2, rejected: { title: 30, description: 6 } },
    linkedin: { status: 'done', found: 30, matched: 2, rejected: { title: 25, experience: 3 } },
  };
  const [ready] = await sql<{ id: string }[]>`insert into campaigns (user_id, name, portals, position_include, desc_include, experience_levels, location, status, scrape_summary, created_at)
    values (${u.id}, 'Data Analyst Jakarta', '{jobstreet,glints,linkedin}', '{Data Analyst,Analis Data,Business Intelligence,BI Developer}', '{SQL,Power BI,Python}',
      '{entry,junior,mid}', 'Jakarta Raya', 'ready', ${sql.json(summary)}, now() - interval '2 hours') returning id`;
  for (const [i, l] of READY.entries()) {
    const id = await listing(l, i, 'r');
    await sql`insert into campaign_matches (campaign_id, listing_id, match_reason, experience_levels, flags, selected)
      values (${ready.id}, ${id}, ${l.reason}, ${l.levels}, ${l.levels.length ? (l.external ? ['external'] : []) : ['experience_unknown']}, true)`;
  }

  const [run] = await sql<{ id: string }[]>`insert into campaigns (user_id, name, portals, position_include, location, status, launched_at, created_at)
    values (${u.id}, 'Business Intelligence', '{jobstreet,glints,linkedin}', '{Business Intelligence,Data Analyst}', 'Indonesia', 'running', now() - interval '25 minutes', now() - interval '1 day') returning id`;
  const answers = [
    { question: 'Berapa tahun pengalaman Anda sebagai Data Analyst?', answer: '2', source: 'profil: pengalaman' },
    { question: 'Ekspektasi gaji per bulan (Rp)', answer: '9000000', source: 'bank jawaban: ekspektasi gaji' },
    { question: 'Bersedia bekerja dari kantor lima hari seminggu?', answer: 'Ya', source: 'bank jawaban: kantor' },
  ];
  for (const [i, l] of RUNNING.entries()) {
    const id = await listing(l, i, 'b');
    const done = l.status !== 'queued';
    const [a] = await sql<{ id: string }[]>`insert into applications (user_id, campaign_id, listing_id, portal, status, attempt_count, failure_reason, submitted_at, confirmation_text, updated_at, scheduled_at, answers, pending_questions)
      values (${u.id}, ${run.id}, ${id}, ${l.portal}, ${l.status}, ${done ? 1 : 0}, ${l.failure ?? null},
        ${l.status === 'submitted' ? sql`now() - ${l.minutesAgo} * interval '1 minute'` : null}, ${l.status === 'submitted' ? 'Lamaran kamu telah terkirim.' : null},
        now() - ${l.minutesAgo} * interval '1 minute', now(), ${l.status === 'submitted' ? sql.json(answers) : null},
        ${l.status === 'needs_action' ? sql.json([{ question: 'How many years of work experience do you have with Tableau?', options: [], multiple: false }]) : null}) returning id`;
    const events: [string, string | null][] = [['queued', null], ...(done ? [['started', null], [l.status, l.failure ?? null]] as [string, string | null][] : [])];
    for (const [k, [event, detail]] of events.entries())
      await sql`insert into application_events (application_id, event, detail, created_at)
        values (${a.id}, ${event}, ${detail}, now() - ${l.minutesAgo + (events.length - k) * 2} * interval '1 minute')`;
  }

  const token = randomToken();
  await sql`insert into sessions (token_hash, user_id, expires_at) values (${sha256(token)}, ${u.id}, now() + interval '1 day')`;
  console.log(JSON.stringify({ token, ready: ready.id, running: run.id }));
}

const cmd = process.argv[2];
if (cmd === 'seed') await seed();
else if (cmd === 'clean') await clean();
else console.log('usage: demo.ts seed | clean');
await sql.end();
