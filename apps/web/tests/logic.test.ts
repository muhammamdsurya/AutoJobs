import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAnswer, optionForNumber } from '../src/lib/answers';
import { makeResolver, NeedsAction, planFields, type Field, type ProfileForApply } from '../src/lib/apply-plan';
import { companyTitleKey, listingLevels, matchListing, parseYears, prefilter, type Criteria, type MatchInput } from '../src/lib/filters';
import { salaryText } from '../src/lib/adapters/glints';
import type { ScrapedListing } from '../src/lib/adapters';
import { gather } from '../src/worker/scrape';
import { randomBytes } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { extensionZip, zip } from '../src/lib/extension-package';
import { validEmail } from '../src/lib/mail';
import { nextData } from '../src/lib/adapters/http';
import { normCompany } from '../src/lib/filters';

// Reads a zip back through its central directory, checking every entry's CRC.
function unzip(z: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const end = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = z.readUInt32LE(end + 16);
  for (let i = 0; i < z.readUInt16LE(end + 10); i++) {
    const nameLen = z.readUInt16LE(p + 28);
    const local = z.readUInt32LE(p + 42);
    const start = local + 30 + z.readUInt16LE(local + 26) + z.readUInt16LE(local + 28);
    const data = inflateRawSync(z.subarray(start, start + z.readUInt32LE(p + 20)));
    assert.equal(crc32(data), z.readUInt32LE(p + 16));
    out.set(z.subarray(p + 46, p + 46 + nameLen).toString(), data);
    p += 46 + nameLen + z.readUInt16LE(p + 30) + z.readUInt16LE(p + 32);
  }
  return out;
}

test('no input can make the parsers slow (ReDoS): each hostile string is handled in milliseconds', () => {
  const fast = (what: string, fn: () => unknown) => {
    const t = Date.now();
    fn();
    assert.ok(Date.now() - t < 300, `${what} took ${Date.now() - t} ms`);
  };
  fast('email check', () => validEmail('a@' + 'a.'.repeat(20_000) + '@'));
  assert.equal(validEmail('nama.depan+kerja@mail.co.id'), true);
  assert.equal(validEmail('bukan email@x'), false);
  fast('years in a description', () => parseYears('pengalaman 3' + ' '.repeat(50_000) + 'x'));
  fast('company names', () => normCompany('('.repeat(50_000)));
  fast('Glints page data', () => assert.throws(() => nextData('<script id="__NEXT_DATA__" type="application/json"'.repeat(20_000))));
  const plan = (label: string) => planFields([{ id: 'q', kind: 'text', label, required: true, options: [] } as unknown as Field],
    makeResolver({ yearsExperience: 3, currentTitle: 'Data Analyst' } as ProfileForApply, {}, [], 'jobstreet'));
  fast('a form label', () => assert.throws(() => plan('berapa tahun pengalaman kerja sebagai' + ' '.repeat(5000) + '?!x' + ' '.repeat(5000) + 'y')));
});

test('extension download: a valid zip, set up for this server\'s address instead of localhost', async () => {
  const bin = randomBytes(5000);
  const back = unzip(zip([{ name: 'a.txt', data: Buffer.from('halo') }, { name: 'fonts/b.bin', data: bin }]));
  assert.deepEqual([...back.keys()], ['a.txt', 'fonts/b.bin']);
  assert.deepEqual(back.get('fonts/b.bin'), bin);

  const ext = unzip(await extensionZip('https://autojobs.example.com'));
  const m = JSON.parse(ext.get('manifest.json')!.toString());
  assert.ok(m.host_permissions.includes('https://autojobs.example.com/*'), 'the extension may call this server');
  assert.ok(m.host_permissions.includes('https://*.linkedin.com/*'));
  assert.ok(!m.host_permissions.some((h: string) => /localhost|127\.0\.0\.1/.test(h)));
  assert.match(ext.get('popup.html')!.toString(), /value="https:\/\/autojobs\.example\.com"/);
  assert.ok(ext.has('fonts/geist-latin.woff2') && ext.has('background.js'));
});

test('search: keywords take turns page by page, so the first keyword cannot use up the per-portal limit', async () => {
  const listings = (k: string, p: number) => Array.from({ length: 3 }, (_, i) => ({ externalId: `${k}${p}-${i}`, title: k }) as unknown as ScrapedListing);
  const calls: string[] = [];
  const found = await gather(['A', 'B', 'C'], 3, 7, async (k, p) => (calls.push(`${k}${p}`), { listings: listings(k, p), hasMore: true }));
  assert.deepEqual(calls, ['A1', 'B1', 'C1'], 'page 1 of every keyword before any page 2');
  assert.equal(found.length, 7);
  assert.deepEqual([...new Set(found.map((l) => l.title))], ['A', 'B', 'C'], 'every keyword is in the results');

  const pagesOf: Record<string, number> = { A: 2, B: 1 };
  const order: string[] = [];
  await gather(['A', 'B'], 3, 100, async (k, p) => (order.push(`${k}${p}`), { listings: listings(k, p), hasMore: p < pagesOf[k] }));
  assert.deepEqual(order, ['A1', 'B1', 'A2'], 'a keyword without more pages drops out');

  // only listings that count (title matches) use up the limit: one of three per page here
  const counted = await gather(['A', 'B'], 3, 2, async (k, p) => ({ listings: listings(k, p), hasMore: true }), undefined, (l) => l.externalId.endsWith('-0'));
  assert.deepEqual(counted.map((l) => l.externalId), ['A1-0', 'A1-1', 'A1-2', 'B1-0']);
});

const listing = (o: Partial<MatchInput>): MatchInput => ({
  portal: 'jobstreet', externalId: '1', title: 'Data Analyst', company: 'PT Maju Jaya', description: '',
  experienceMin: null, experienceMax: null, seniorityLabel: '', jobType: '', applyMethod: 'portal_apply', closed: false, ...o,
});
const criteria = (o: Partial<Criteria>): Criteria => ({
  positionInclude: ['data analyst'], positionExclude: [], descInclude: [], descMode: 'or', descExclude: [],
  experienceLevels: [], companyExclude: [], ...o,
});
const none = { keys: new Set<string>(), companyTitles: new Set<string>() };

test('parseYears reads Indonesian and English phrasings', () => {
  assert.deepEqual(parseYears('Pengalaman minimal 1–3 tahun sebagai Data Analyst'), [1, 3]);
  assert.deepEqual(parseYears('Minimal 2 tahun pengalaman di bidang yang sama'), [2, null]);
  assert.deepEqual(parseYears('At least 5 years of experience'), [5, null]);
  assert.deepEqual(parseYears('3+ years experience in SQL'), [3, null]);
  assert.deepEqual(parseYears('Fresh graduate dipersilakan melamar'), [0, 1]);
  assert.deepEqual(parseYears('Pengalaman 1-3 tahun sebagai analis. Fresh graduate dipersilakan melamar'), [0, 3]);
  assert.equal(parseYears('Menguasai Excel dan SQL'), null);
  assert.equal(parseYears('Kantor di lantai 5th, dekat stasiun'), null);
  assert.deepEqual(parseYears('Maximum 3 years of experience as a business analyst'), [0, 3]);
  assert.deepEqual(parseYears('Pengalaman maksimal 2 tahun'), [0, 2]);
  assert.deepEqual(parseYears('Minimum 5 years up to 8 years of experience in PMO'), [5, 8]);
  assert.equal(parseYears('With over 100 years of experience, we serve partners worldwide'), null);
  assert.equal(parseYears('Kontrak 1 tahun, dapat diperpanjang. Perusahaan berdiri lebih dari 10 tahun.'), null);
});

test('experience levels per portal source', () => {
  assert.deepEqual(listingLevels(listing({ experienceMin: 1, experienceMax: 3 })), ['junior']);
  assert.deepEqual(listingLevels(listing({ experienceMin: 0, experienceMax: 1 })), ['entry']);
  assert.deepEqual(listingLevels(listing({ experienceMin: 3, experienceMax: 3 })), ['mid']);
  assert.deepEqual(listingLevels(listing({ experienceMin: 5, experienceMax: 10 })), ['senior', 'lead']);
  assert.deepEqual(listingLevels(listing({ portal: 'linkedin', seniorityLabel: 'Mid-Senior level' })), ['mid', 'senior']);
  // years written in the description win over the portal's label or bucket
  assert.deepEqual(listingLevels(listing({ portal: 'linkedin', seniorityLabel: 'Mid-Senior level', description: 'Minimum 1 year of experience' })), ['junior']);
  assert.deepEqual(listingLevels(listing({ experienceMin: 3, experienceMax: 5, description: 'Experience: 2 year (minimum)' })), ['junior', 'mid']);
  // "fresh graduate welcome" without years only widens the portal's range down to 0
  assert.deepEqual(listingLevels(listing({ experienceMin: 1, experienceMax: 3, description: 'Fresh graduate dipersilakan melamar' })), ['entry', 'junior']);
  assert.deepEqual(listingLevels(listing({ title: 'Data Analyst Intern' })), ['internship']);
  assert.deepEqual(listingLevels(listing({ description: 'Minimal 2 tahun pengalaman' })), ['junior', 'mid']);
  assert.deepEqual(listingLevels(listing({ title: 'Senior Data Analyst' })), ['senior']);
  assert.equal(listingLevels(listing({})), null);
});

test('title include/exclude and company blacklist', () => {
  assert.equal(prefilter(listing({ title: 'Senior Data Analyst' }), criteria({})), null);
  assert.equal(prefilter(listing({ title: 'Data Engineer' }), criteria({})), 'title');
  assert.equal(prefilter(listing({ title: 'Data Analyst Internship' }), criteria({ positionExclude: ['intern'] })), 'title_exclude');
  assert.equal(prefilter(listing({ company: 'PT Maju Jaya Tbk' }), criteria({ companyExclude: ['Maju Jaya'] })), 'company');
});

test('description AND/OR, exclusions, experience, dedupe', () => {
  const l = listing({ description: 'Menguasai SQL dan Python. Minimal 2 tahun pengalaman.' });
  assert.equal(matchListing(l, criteria({ descInclude: ['sql', 'tableau'], descMode: 'or' }), none).ok, true);
  assert.equal(matchListing(l, criteria({ descInclude: ['sql', 'tableau'], descMode: 'and' }), none).ok, false);
  assert.equal(matchListing(l, criteria({ descExclude: ['python'] }), none).ok, false);
  assert.equal(matchListing(l, criteria({ experienceLevels: ['senior'] }), none).ok, false);
  const unknown = matchListing(listing({}), criteria({ experienceLevels: ['junior'] }), none);
  assert.ok(unknown.ok && unknown.flags.includes('experience_unknown'), 'unknown level is kept, flagged');
  const applied = { keys: new Set(['jobstreet:1']), companyTitles: new Set<string>() };
  assert.deepEqual(matchListing(l, criteria({}), applied), { ok: false, rejectedBy: 'applied' });
  const otherPortal = { keys: new Set<string>(), companyTitles: new Set([companyTitleKey('Maju Jaya', 'Data Analyst')]) };
  assert.deepEqual(matchListing(l, criteria({}), otherPortal), { ok: false, rejectedBy: 'applied' });
  assert.deepEqual(matchListing(listing({ closed: true }), criteria({}), none), { ok: false, rejectedBy: 'closed' });
});

test('answer bank: most specific wins, ties are ambiguous, never guesses', () => {
  const bank = [
    { questionPattern: 'tahun pengalaman', answer: '5', portal: null },
    { questionPattern: 'pengalaman analis data', answer: '3', portal: null },
    { questionPattern: 'years of experience with SQL', answer: '4', portal: null },
  ];
  const q = 'Berapa tahun pengalaman kerjamu sebagai analis data?';
  assert.deepEqual(findAnswer(q, bank, 'jobstreet'), { kind: 'found', answer: '3', pattern: 'pengalaman analis data' });
  assert.equal(findAnswer('How many years of work experience do you have with SQL?', bank, 'glints').kind, 'found');
  assert.equal(findAnswer('Do you have a driving license?', bank, 'glints').kind, 'none');
  const tie = [...bank, { questionPattern: 'pengalaman data analis', answer: '2', portal: null }];
  assert.equal(findAnswer(q, tie, 'jobstreet').kind, 'ambiguous');
  const scoped = [...bank, { questionPattern: 'pengalaman analis data', answer: '1', portal: 'glints' }];
  assert.deepEqual(findAnswer(q, scoped, 'glints'), { kind: 'found', answer: '1', pattern: 'pengalaman analis data' });
});

test('apply planner: answers from bank and profile, blanks optional unknowns, stops on required unknowns', () => {
  const profile: ProfileForApply = { email: 'budi@example.test', linkedinUrl: '', portfolioUrl: '', expectedSalaryMin: 7000000, noticePeriod: '1 bulan' };
  const bank = [
    { questionPattern: 'tahun pengalaman analis data', answer: '3', portal: null },
    { questionPattern: 'bersedia ditempatkan jakarta', answer: 'Ya', portal: null },
  ];
  const opt = (id: string, label: string) => ({ id, label });
  const fields: Field[] = [
    { id: 'q1', kind: 'select', inputType: 'select', label: 'Berapa tahun pengalaman kerjamu sebagai analis data?', required: true, filled: false,
      options: [opt('a', 'Kurang dari 1 tahun'), opt('b', '1-2 tahun'), opt('c', '3-4 tahun'), opt('d', 'Lebih dari 5 tahun')] },
    { id: 'q2', kind: 'radio', inputType: 'radio', label: 'Apakah kamu bersedia ditempatkan di Jakarta?', required: true, filled: false,
      options: [opt('y', 'Ya'), opt('n', 'Tidak')] },
    // The portal fills contact details from the user's account there; AutoJobs leaves what it filled alone.
    { id: 'ph', kind: 'text', inputType: 'tel', label: 'Nomor ponsel *', required: false, filled: true, options: [] },
    { id: 'web', kind: 'text', inputType: 'text', label: 'Situs web pribadi (opsional)', required: false, filled: false, options: [] },
    { id: 'pre', kind: 'text', inputType: 'email', label: 'Email', required: true, filled: true, options: [] },
  ];
  const { actions, answers } = planFields(fields, makeResolver(profile, {}, bank, 'jobstreet'));
  assert.deepEqual(actions, [
    { do: 'select', id: 'q1', value: 'c' },
    { do: 'check', id: 'y' },
  ]);
  assert.deepEqual(answers.map((a) => a.answer), ['3', 'Ya', ''], 'optional unknown left empty, pre-filled fields untouched');
  // A required contact field the portal left empty isn't in the profile any more: the user answers it once.
  assert.throws(() => planFields([{ ...fields[2], filled: false }], makeResolver(profile, {}, bank, 'jobstreet')), NeedsAction);
  assert.deepEqual(planFields([{ ...fields[4], filled: false }], makeResolver(profile, {}, bank, 'jobstreet')).actions,
    [{ do: 'fill', id: 'pre', value: 'budi@example.test', combobox: undefined }], 'email comes from the AutoJobs account');
  assert.throws(() => planFields(fields, makeResolver(profile, {}, bank.slice(0, 1), 'jobstreet')),
    (e: unknown) => e instanceof NeedsAction && /bersedia ditempatkan di Jakarta/.test(e.message) &&
      JSON.stringify(e.questions) === JSON.stringify([{ question: 'Apakah kamu bersedia ditempatkan di Jakarta?', options: ['Ya', 'Tidak'], multiple: false }]),
    'stops with the question and the options, so the user can answer it in AutoJobs');
});

test('professional data answers matching screening questions; the rest still needs action', () => {
  const profile: ProfileForApply = {
    email: 'budi@example.test', linkedinUrl: '', portfolioUrl: '', expectedSalaryMin: 7000000, noticePeriod: 'Segera',
    currentTitle: 'Business Intelligence Analyst', yearsExperience: 3.5, educationLevel: 'S1',
    educationMajor: 'Statistika', skills: ['SQL', 'Python', 'Power BI', 'ETL', 'Excel'], willingToRelocate: false,
  };
  const resolve = makeResolver(profile, {}, [], 'jobstreet');
  // Options as seen on real JobStreet forms (2026-09-30).
  const YEARS = ['No experience', 'Less than 1 year', '1 year', '2 years', '3 years', '4 years', '5 years', 'More than 5 years'];
  const QUAL = ['SMA/SMK or equivalent', 'Diploma 3', 'Diploma 4', 'Bachelor Degree (S1)', 'Professional Education Program', 'Masters Degree (S2)'];
  const TOOLS = ['SAS', 'Tableau', 'SPSS', 'R', 'Excel', 'Matlab', 'SQL', 'None of these'];
  const NOTICE = ["None, I'm ready to go now", 'Less than 1 month', '1 month', '2 months', 'More than 2 months'];
  const YN = ['Yes', 'No'];
  const opt = (labels: string[]) => labels.map((label, i) => ({ id: `o${i}`, label }));
  const field = (label: string, labels: string[], kind: Field['kind'] = 'select'): Field =>
    ({ id: label, kind, inputType: kind, label, required: true, filled: false, options: opt(labels) });
  const picked = (f: Field) => {
    const { actions } = planFields([f], resolve);
    return actions.map((a) => f.options.find((o) => o.id === ('value' in a ? a.value : a.id))!.label).join('; ');
  };

  assert.equal(picked(field("How many years' experience do you have as a Business Intelligence Analyst?", YEARS)), '3 years', 'current title: floor(3.5)');
  assert.equal(picked(field('Berapa tahun pengalaman kerjamu?', YEARS)), '3 years', 'total experience');
  assert.equal(picked(field('Which of the following types of qualifications do you have?', QUAL)), 'Bachelor Degree (S1)');
  assert.equal(picked(field('Which of the following data analytics tools are you experienced with?', TOOLS, 'checkbox')), 'Excel; SQL');
  assert.equal(picked(field('Do you have experience using ETL Tools?', YN, 'radio')), 'Yes');
  assert.equal(picked(field('How much notice are you required to give your current employer?', NOTICE, 'radio')), "None, I'm ready to go now");

  // Not in the professional data → the user decides.
  for (const f of [
    field("How many years' experience do you have as a Human Resources Staff?", YEARS), // another role
    field("How many years' experience do you have using SQL queries?", YEARS), // years with one tool
    field('Do you have Training Development experience?', YN, 'radio'), // skill not listed
    field('Apakah kamu bersedia pindah domisili?', ['Ya', 'Tidak'], 'radio'), // not willing → not answered "Tidak" for them
    field('Which of the following programming languages are you experienced in?', ['.NET', 'C', 'Java', 'None of these'], 'checkbox'),
    field('Nama universitas tempat kamu lulus?', [], 'text'), // institution: no longer in the profile
  ]) assert.throws(() => planFields([f], resolve), NeedsAction, f.label);
});

test('numeric answers map onto range options', () => {
  assert.equal(optionForNumber(4, ['Kurang dari 1 tahun', '1-3 tahun', '4-5 tahun', 'Lebih dari 5 tahun']), '4-5 tahun');
  assert.equal(optionForNumber(7000000, ['Rp 5 jt - Rp 6 jt', 'Rp 6,5 jt - Rp 8 jt', 'Rp 8 jt+']), 'Rp 6,5 jt - Rp 8 jt');
  assert.equal(optionForNumber(7500000, ['Rp 5.000.000 - Rp 7.000.000', 'Rp 7.000.001 - Rp 9.000.000']), 'Rp 7.000.001 - Rp 9.000.000');
  assert.equal(optionForNumber(3, ['1-3 tahun', '3-5 tahun']), null, 'boundary on two options is ambiguous');
  assert.equal(optionForNumber(5, ['4 tahun', '5 tahun', 'Lebih dari 5 tahun']), '5 tahun', 'exact value beats an open range');
  assert.equal(optionForNumber(2, ['Ya', 'Tidak']), null);
});

test('Glints salary text tolerates a missing minimum or maximum', () => {
  assert.equal(salaryText({ minAmount: 8000000, maxAmount: 10000000, salaryMode: 'MONTH' }), 'Rp 8.000.000 - Rp 10.000.000 per bulan');
  assert.equal(salaryText({ minAmount: null, maxAmount: 8000000, salaryMode: 'MONTH' }), 's.d. Rp 8.000.000 per bulan');
  assert.equal(salaryText({ minAmount: 5000000, maxAmount: null }), 'Rp 5.000.000+');
  assert.equal(salaryText({ minAmount: null, maxAmount: null, salaryMode: 'MONTH' }), '');
  assert.equal(salaryText(null), '');
});

test('a single consent checkbox is ticked when the answer is its own text', () => {
  const profile: ProfileForApply = { email: '', linkedinUrl: '', portfolioUrl: '', expectedSalaryMin: null, noticePeriod: '' };
  const q = 'Please be informed that your application will trigger some processing of your personal data.*';
  const field: Field = { id: 'c', kind: 'checkbox', inputType: 'checkbox', label: q, required: false, filled: false, options: [{ id: 'c1', label: 'I consent' }] };
  assert.throws(() => planFields([field], makeResolver(profile, {}, [], 'linkedin')), NeedsAction, 'required by the trailing *');
  const bank = [{ questionPattern: 'processing personal data', answer: 'I consent', portal: null }];
  assert.deepEqual(planFields([field], makeResolver(profile, {}, bank, 'linkedin')).actions, [{ do: 'check', id: 'c1' }]);
});

test('number-only questions get plain numbers; notice period in the unit asked; rejected values are refilled', () => {
  const profile: ProfileForApply = { email: '', linkedinUrl: '', portfolioUrl: '', expectedSalaryMin: 7000000, noticePeriod: '1 bulan', yearsExperience: 3.5 };
  const resolve = makeResolver(profile, {}, [], 'linkedin');
  const text = (label: string, extra: Partial<Field> = {}): Field =>
    ({ id: label, kind: 'text', inputType: 'text', label, required: true, filled: false, options: [], ...extra });
  const fill = (f: Field) => planFields([f], resolve).actions.map((a) => ('value' in a ? a.value : a.do));

  // LinkedIn (TUKR, 2026-09-30): "1 bulan" was typed where days were asked → "Input tidak valid".
  assert.deepEqual(fill(text('What is your notice period? (Please indicate the number of days)*')), ['30']);
  assert.deepEqual(fill(text('Notice period in weeks')), ['4']);
  assert.deepEqual(fill(text('Expectation Salary*')), ['7000000']);
  assert.deepEqual(fill(text('Number of years of experience:*')), ['3']);
  // Pre-filled by LinkedIn from an earlier application with text where a number is asked, or flagged invalid: refilled.
  assert.deepEqual(fill(text('What is your notice period? (Please indicate the number of days)*', { filled: true, value: '1 bulan' })), ['30']);
  assert.throws(() => fill(text('Current Salary*', { filled: true, value: 'tujuh juta', invalid: true })), NeedsAction, 'current ≠ expected salary: asked');
  assert.throws(() => fill(text('Current Salary*')), NeedsAction);
  assert.deepEqual(fill(text('Expectation Salary*', { filled: true, value: '7000000' })), [], 'a valid number stays as the portal filled it');
  // A number question the profile can only answer with words: the user decides the number.
  assert.throws(() => planFields([text('How many notice days do you need?', {})], makeResolver({ ...profile, noticePeriod: 'Negosiasi' }, {}, [], 'linkedin')), NeedsAction);
});
