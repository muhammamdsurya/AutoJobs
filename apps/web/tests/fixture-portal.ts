// A fake portal modelled on JobStreet's Quick Apply as seen in a real dry run (2026-09-28): loading spinner first,
// resumes listed as radios named by file (an upload is added to the list and selected), "Jangan sertakan resume"
// before the cover-letter radios, and buttons labelled with a trailing word joiner ("Lanjut⁠").
// Like Glints: a spinner that never stops, far below the fold of the job page.
const JOB = (body: string) => `<html><body><h1>Data Analyst</h1>${body}
<div style="height:3000px"></div><div role="alert" aria-busy="true" style="width:40px;height:40px;background:#ccc"></div></body></html>`;

// extraQuestion: one more employer question that isn't in the test answer bank (→ "Perlu tindakan"). Like JobStreet's,
// it renders a moment after the step, so the extension's first read of the step misses it.
const apply = (existingCv: boolean, extraQuestion = false) => `<html><body>
<span role="progressbar" style="display:block;width:25%;height:4px;background:#1d4ed8"></span><!-- step indicator, always there -->
<main id="app"></main><script>
const steps = [
  '<h2>Pilih dokumen</h2>' +
  '<fieldset id="docs"><legend>Resumé</legend>' +
  '<label><input type="radio" name="document-select" value="CV_lama.pdf"> CV_lama.pdf</label>' +
  ${existingCv ? `'<label><input type="radio" name="document-select" value="CV.pdf"> CV.pdf</label>' +` : ''}
  '<label><input type="radio" name="document-select" value="none"> Jangan sertakan resume</label></fieldset>' +
  '<div><p>Unggah resume (PDF/DOCX)</p><input type="file" id="cv" onchange="uploaded(this)"></div>' +
  '<fieldset><legend>Surat lamaran</legend><label><input type="radio" name="cl" value="upload"> Unggah surat lamaran</label>' +
  '<label><input type="radio" name="cl" value="write"> Tulis surat lamaran</label>' +
  '<label><input type="radio" name="cl" value="none"> Jangan sertakan surat lamaran</label></fieldset>' +
  '<button data-testid="continue-button" onclick="next()">Lanjut&#8288;</button>',
  '<h2>Jawab pertanyaan pemberi kerja</h2>' +
  // Employer questions: named questionnaire.*, not marked required; the salary one is pre-filled by the portal.
  '<label for="q0">Berapa gaji bulanan yang kamu inginkan?</label><select id="q0" name="questionnaire.ID_Q_2588_V_2">' +
  '<option value=""></option><option value="6" selected>Rp 6 Jt</option><option value="7">Rp 7 Jt</option></select>' +
  '<label for="q1">Berapa tahun pengalaman kerjamu sebagai analis data?</label>' +
  '<select id="q1" name="questionnaire.ID_Q_B941_V_3"><option value="">Pilih</option><option value="a">Kurang dari 1 tahun</option><option value="b">1-2 tahun</option>' +
  '<option value="c">3-4 tahun</option><option value="d">Lebih dari 5 tahun</option></select>' +
  '<fieldset><legend>Apakah kamu bersedia ditempatkan di Jakarta?</legend><label><input type="radio" name="questionnaire.ID_Q_385_V_2" value="y"> Ya</label>' +
  '<label><input type="radio" name="questionnaire.ID_Q_385_V_2" value="n"> Tidak</label></fieldset>' +
  '<div id="late"></div>' +
  // Contact details come pre-filled from the user's own portal account (AutoJobs no longer keeps them).
  '<label for="ph">Nomor ponsel *</label><input id="ph" type="tel" value="81234567890">' +
  '<label for="web">Situs web pribadi (opsional)</label><input id="web" type="text">' +
  '<button data-testid="continue-button" onclick="next()">Lanjut&#8288;</button>',
  '<h2>Tinjau dan kirim</h2><button onclick="submitApp()">Kirim lamaran&#8288;</button>',
];
let i = 0; const a = { uploads: 0 };
const render = () => {
  document.getElementById('app').innerHTML = steps[i];
  if (i === 1 && ${extraQuestion}) setTimeout(() => { document.getElementById('late').innerHTML =
    '<select id="q3" aria-label="Apakah kamu memiliki SIM A?" name="questionnaire.ID_Q_SIM_V_1"><option value=""></option><option value="ya">Ya</option><option value="tidak">Tidak</option></select>'; }, 3500);
};
function uploaded(input) {
  const name = input.files[0].name;
  a.uploads++;
  document.getElementById('docs').insertAdjacentHTML('afterbegin', '<label><input type="radio" name="document-select" value="' + name + '" checked> ' + name + '</label>');
}
function next() {
  if (i === 0) { a.resume = document.querySelector('input[name=document-select]:checked')?.value; a.cl = document.querySelector('input[name=cl]:checked')?.value; }
  if (i === 1) {
    a.q0 = document.getElementById('q0').value; a.q1 = document.getElementById('q1').value;
    a.q2 = document.querySelector('input[name="questionnaire.ID_Q_385_V_2"]:checked')?.value; a.ph = document.getElementById('ph').value;
    if (${extraQuestion}) a.sim = document.getElementById('q3')?.value || '';
    if (!a.q1 || !a.q2 || !a.ph || a.sim === '') return;
  }
  i++; render();
}
function submitApp() { document.getElementById('app').innerHTML = '<p>Lamaran kamu telah terkirim ke PT Contoh. ' + JSON.stringify(a) + '</p>'; }
// Like JobStreet's apply app: a loading spinner first, the form a moment later.
document.getElementById('app').innerHTML = '<div aria-label="Loading" role="alert" style="width:80px;height:20px;background:#ccc"></div>';
setTimeout(render, 2500);
</script></body></html>`;

export const PAGES: Record<string, string> = {
  '/job/1': JOB('<a data-automation="job-detail-apply" href="/job/1/apply">Lamaran Cepat</a>'),
  '/job/1/apply': apply(false),
  '/job/2': JOB('<p>Kamu melamar pada 12 Sep 2026</p>'),
  '/job/3': JOB('<p>Lowongan ini sudah tidak tersedia.</p>'),
  '/job/5': JOB('<a data-automation="job-detail-apply" href="/job/5/apply">Lamaran Cepat</a>'),
  '/job/5/apply': apply(true),
  '/job/6': JOB('<a data-automation="job-detail-apply" href="/job/6/apply">Lamaran Cepat</a>'),
  '/job/6/apply': apply(true, true),
  '/job/7': JOB('<a data-automation="job-detail-apply" href="/job/7/apply">Lamaran Cepat</a>'),
  '/job/7/apply': apply(false),
};

export const BANK = [
  { questionPattern: 'tahun pengalaman analis data', answer: '3', portal: null },
  { questionPattern: 'bersedia ditempatkan jakarta', answer: 'Ya', portal: null },
];
