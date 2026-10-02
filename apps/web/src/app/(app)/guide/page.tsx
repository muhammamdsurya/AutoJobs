import {
  ArrowRight, ChartColumn, Check, CircleCheck, CircleX, Coins, Eye, Filter, LayoutGrid, ListOrdered, Plug, Search, Send, ThumbsUp,
  UserRound, Workflow, X, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@autojobs/shared/ui';
import { getSettings } from '@autojobs/shared/settings';
import { FREE_SEARCHES } from '@autojobs/shared/tokens';
import { Tutorial } from './tutorial';

const SECTIONS: [string, string, LucideIcon][] = [
  ['langkah', 'Langkah demi langkah', ListOrdered],
  ['lakukan', 'Lakukan dan hindari', ThumbsUp],
  ['menu', 'Fitur tiap menu', LayoutGrid],
  ['cara-kerja', 'Cara kerja sistem', Workflow],
];

const STEPS: [string, React.ReactNode, [string, string]?][] = [
  ['Pasang dan pasangkan ekstensi AutoJobs',
    <>Lamaran dikirim dari Chrome atau Edge di komputer Anda, bukan dari HP. Di Koneksi Portal, klik <b>Unduh ekstensi (.zip)</b>, ekstrak ke folder tetap, lalu pasang lewat <b>Load unpacked</b> di halaman ekstensi Chrome (Mode pengembang aktif). Setelah itu klik <b>Buat kode pairing</b> dan masukkan kodenya di popup ekstensi (ikon AutoJobs di toolbar Chrome). Ekstensi terhubung ke akun yang membuat kodenya.</>,
    ['/connections', 'Buka Koneksi Portal']],
  ['Masuk ke JobStreet, Glints, dan LinkedIn',
    <>Masuk seperti biasa di Chrome yang sama, lalu klik <b>Periksa login portal</b> di popup ekstensi. Statusnya tampil di Koneksi Portal. Bila portal meminta CAPTCHA atau kode verifikasi, selesaikan sendiri.</>],
  ['Lengkapi Profil dan CV',
    <>Isi data profesional (jabatan, pengalaman, pendidikan, keahlian, gaji yang diharapkan, masa pemberitahuan), unggah CV dalam format PDF, lalu pilih CV yang dipakai di tiap portal: CV AutoJobs atau CV yang sudah ada di portal. Tanpa CV AutoJobs, CV yang tersimpan di akun portal dipakai otomatis. Kotak <b>Kelengkapan per portal</b> menunjukkan yang masih kurang.</>,
    ['/profile', 'Buka Profil']],
  ['Isi bank jawaban',
    <>Simpan jawaban untuk pertanyaan perusahaan yang sering muncul, misalnya kesediaan ditempatkan di kota lain. Pertanyaan yang cocok dengan polanya terisi otomatis. Boleh dilewati: pertanyaan wajib yang belum ada jawabannya akan ditanyakan kepada Anda di Laporan.</>,
    ['/profile#bank-jawaban', 'Buka bank jawaban']],
  ['Buat pencarian di Cari Loker',
    <>Klik <b>Pencarian baru</b>, pilih portal, tulis kata kunci judul dalam bahasa Indonesia dan Inggris, pilih level pengalaman dan lokasi, lalu klik <b>Cari lowongan</b>. Satu pencarian baru memakai 1 token, berapa pun jumlah kata kuncinya.</>,
    ['/campaigns/new', 'Buat pencarian']],
  ['Tinjau hasilnya',
    <>Setiap lowongan disertai alasan cocoknya. Hapus centang lowongan yang tidak ingin Anda lamar. Lowongan yang tersaring bisa dilihat beserta alasannya; bila ada yang relevan, tambahkan kata kuncinya lalu cari ulang. Mengubah kriteria dan mencari ulang gratis selama pencarian belum diluncurkan.</>],
  ['Jalankan uji coba, lalu luncurkan',
    <>Centang <b>Uji coba</b> untuk mengisi formulir sampai akhir tanpa mengirim, lalu periksa tangkapan layarnya di Laporan. Setelah yakin, luncurkan tanpa uji coba. Lowongan dari portal yang login-nya belum terdeteksi tetap masuk antrean dan menunggu sampai Anda masuk.</>],
  ['Biarkan Chrome terbuka dan pantau di Laporan',
    <>Ekstensi melamar di jendela AutoJobs, satu per satu. Status setiap lamaran tampil di Laporan, juga dari HP. Jawab yang <b>Perlu tindakan</b> supaya antrean tidak tertahan. Saat token habis, klik saldo token di kanan atas untuk mengisinya lewat QRIS.</>,
    ['/report', 'Buka Laporan']],
];

const DO: React.ReactNode[] = [
  'Jalankan uji coba di pencarian pertama tiap portal, lalu periksa tangkapan layarnya di Laporan.',
  'Tulis kata kunci judul dalam bahasa Indonesia dan Inggris beserta variasinya, mis. Business Analyst, Analis Bisnis, BI Analyst.',
  'Gabungkan beberapa kata kunci dalam satu pencarian: tetap 1 token.',
  'Lengkapi Profil, CV, dan bank jawaban sebelum meluncurkan.',
  'Biarkan komputer menyala dan Chrome terbuka selama antrean berjalan, dengan sebagian jendela AutoJobs tetap terlihat.',
  'Tetap masuk ke ketiga portal di Chrome yang dipasangi ekstensi, dan selesaikan sendiri CAPTCHA atau kode verifikasi.',
  <>Buka Laporan secara berkala dan jawab yang <b>Perlu tindakan</b>.</>,
];

const DONT: React.ReactNode[] = [
  'Menutup, memperkecil, atau menutupi seluruh jendela AutoJobs saat antrean berjalan: antrean akan menunggu. Untuk keperluan lain, pakai jendela Chrome yang lain.',
  'Keluar dari akun portal di Chrome itu selama antrean berjalan.',
  'Menghapus atau memindahkan folder hasil ekstrak ekstensi: Chrome memakainya langsung, jadi ekstensinya ikut berhenti.',
  'Kata kunci yang terlalu pendek atau umum seperti "BI" atau "IT": ikut cocok dengan kata lain, misalnya "Bisnis" atau "SIM BI".',
  'Meluncurkan tanpa meninjau daftarnya: AutoJobs melamar atas nama Anda dengan data profil Anda.',
  'Membagikan kode pairing, atau memasangkan ekstensi di komputer orang lain ke akun Anda.',
  'Mengharapkan lamaran berjalan dari HP: ekstensi hanya berjalan di Chrome atau Edge komputer. HP cukup untuk memantau dan menjawab pertanyaan.',
];

export default async function GuidePage() {
  const { delaySec, dailyCap } = await getSettings();

  const menus: [string, LucideIcon, string, React.ReactNode[]][] = [
    ['Cari Loker', Search, '/campaigns', [
      'Daftar pencarian beserta statusnya: Mencari lowongan, Siap ditinjau, Berjalan, Dijeda, Selesai, Dibatalkan.',
      'Pencarian baru: portal, kata kunci judul, judul yang dikecualikan, isi deskripsi yang wajib atau dilarang, level pengalaman, perusahaan yang dihindari, lokasi, serta batas halaman dan lowongan.',
      'Hasil pencarian: jumlah ditemukan dan cocok per portal, daftar yang tersaring beserta alasannya, ubah kriteria dan cari ulang.',
      'Tinjau dan luncurkan: pilih lowongan, uji coba, dan perkiraan waktu selesai.',
      'Setelah diluncurkan: antrean per portal, jeda, lanjutkan, batalkan sisa antrean, dan unduh lamaran terkirim.',
    ]],
    ['Laporan', ChartColumn, '/report', [
      'Semua lamaran dengan statusnya: Dalam antrean, Diproses, Terkirim, Perlu tindakan, Gagal, Dilewati, Dibatalkan.',
      'Filter menurut status, portal, pencarian, tanggal, dan kata.',
      'Detail lamaran: jawaban yang dikirim, riwayat, tangkapan layar, dan konfirmasi dari portal.',
      'Pertanyaan yang perlu Anda jawab: jawabannya disimpan ke bank jawaban dan lamaran yang tertahan dilanjutkan otomatis.',
      <><b>Coba lagi</b> untuk lamaran Gagal atau Perlu tindakan setelah penyebabnya diperbaiki.</>,
      'Lowongan yang harus dilamar di situs perusahaan dicatat beserta tautannya. Lamaran terkirim bisa diunduh (Excel/CSV).',
    ]],
    ['Koneksi', Plug, '/connections', [
      'Status ekstensi (Aktif atau Tidak aktif) dan kapan terakhir terlihat.',
      'Buat kode pairing dan putuskan ekstensi.',
      'Status login tiap portal: Sudah masuk, Belum masuk, atau Perlu verifikasi.',
      `Lamaran terkirim hari ini dibanding batas harian (${dailyCap} per portal).`,
      'Isian khusus portal: gaji yang diharapkan (JobStreet, Glints) dan surat lamaran (JobStreet).',
    ]],
    ['Profil', UserRound, '/profile', [
      'Kelengkapan per portal: data yang masih kurang sebelum bisa melamar.',
      'Data profesional untuk mengisi formulir dan menjawab pertanyaan.',
      'CV (PDF): unggah, pilih CV utama, dan pilih CV AutoJobs atau CV di portal untuk tiap portal. Tanpa CV AutoJobs, CV di portal dipakai otomatis.',
      'Bank jawaban: pola pertanyaan dan jawabannya, bisa khusus untuk satu portal.',
      'Akun: hapus akun beserta seluruh datanya.',
    ]],
    ['Token (saldo di kanan atas)', Coins, '/token', [
      'Sisa token: 1 token = 1x Cari Loker. Mengubah kriteria dan mencari ulang sebelum diluncurkan gratis.',
      'Isi token: pilih paket, lalu bayar dengan QRIS sesuai nominal yang tertera. Token masuk otomatis setelah pembayaran terdeteksi.',
      'Riwayat pembelian, dan unggah bukti transfer bila token belum masuk.',
    ]],
  ];

  const stages: [LucideIcon, string, string][] = [
    [Search, 'Mencari',
      'Untuk tiap kata kunci, AutoJobs membuka halaman hasil pencarian portal secara bergiliran. JobStreet dan LinkedIn dicari dari server AutoJobs; Glints lewat Chrome Anda, karena Glints hanya melayani browser yang sudah terverifikasi. Pencarian di tiap portal berhenti setelah batas lowongan berjudul cocok tercapai atau halamannya habis.'],
    [Filter, 'Menyaring',
      'Judul harus memuat salah satu kata kunci secara berurutan: "Data Analyst" cocok dengan "Senior Data Analyst", tetapi tidak dengan "Analyst Data". Lalu diperiksa judul yang dikecualikan, isi deskripsi, perusahaan yang dihindari, level pengalaman (dari tahun yang ditulis di deskripsi, atau kategori portal bila tidak ada), lowongan yang sudah pernah Anda lamar, dan duplikat di portal lain.'],
    [Eye, 'Meninjau',
      'Hasilnya menunggu Anda. Tidak ada lamaran yang dikirim sebelum Anda meluncurkan. Lowongan yang levelnya tidak tercantum tetap ditampilkan dengan tanda.'],
    [Send, 'Melamar',
      `Ekstensi membuka lowongan di jendela AutoJobs dengan login portal Anda sendiri, mengisi formulir dari Profil dan bank jawaban, memilih CV, lalu mengirim dan menyimpan buktinya. Tiap putaran: satu lamaran di tiap portal berturut-turut, lalu jeda ${delaySec} detik. Paling banyak ${dailyCap} lamaran per portal per hari; sisanya dilanjutkan besok.`],
  ];

  const facts: React.ReactNode[] = [
    <>Pertanyaan wajib yang belum ada jawabannya tidak pernah ditebak: lamarannya ditandai <b>Perlu tindakan</b> sampai Anda menjawab.</>,
    <>Saat Chrome baru dibuka, antrean ditahan sampai Anda klik <b>Lanjutkan</b> di notifikasi AutoJobs atau <b>Lanjutkan antrean</b> di popup ekstensi, supaya jendela AutoJobs tidak muncul tiba-tiba.</>,
    'Di LinkedIn, hanya lowongan Easy Apply yang dilamar otomatis. Lowongan yang melamar di situs perusahaan dicatat di Laporan untuk Anda lamar sendiri.',
    'AutoJobs tidak menyimpan kata sandi atau sesi portal Anda. Login tetap berada di Chrome Anda.',
    'Ketiga portal membatasi otomatisasi dalam ketentuannya. Jeda dan batas harian dibuat untuk menjaga akun portal Anda, dan Anda sendiri yang meluncurkan setiap pencarian.',
  ];

  const bold = '[&_b]:font-medium [&_b]:text-ink';
  const list = `list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted marker:text-white/30 ${bold}`;
  return (
    <>
      <PageHeader title="Panduan" subtitle="Cara memakai AutoJobs dari awal, yang sebaiknya dilakukan dan dihindari, fitur tiap menu, dan cara sistemnya bekerja.">
        <Tutorial trigger="Putar tutorial singkat" freeTokens={FREE_SEARCHES} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <nav className="glass hidden rounded-card p-2 lg:sticky lg:top-24 lg:block" aria-label="Bagian panduan">
          {SECTIONS.map(([id, label, Icon]) => (
            <a key={id} href={`#${id}`} className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm text-muted no-underline transition-colors hover:bg-white/6 hover:text-ink hover:no-underline">
              <Icon className="size-4" aria-hidden />{label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          <section id="langkah" className="card scroll-mt-24" aria-labelledby="h-langkah">
            <h2 id="h-langkah">Langkah demi langkah</h2>
            <ol className="mt-5 space-y-6">
              {STEPS.map(([title, body, link], i) => (
                <li key={title} className="flex gap-3.5">
                  <span className="num grid size-7 shrink-0 place-items-center rounded-chip bg-accent/12 text-sm text-teal-200 ring-1 ring-inset ring-accent/25">{i + 1}</span>
                  <div className="min-w-0">
                    <h3 className="font-sans text-base font-semibold">{title}</h3>
                    <p className={`mt-1 max-w-[70ch] text-sm leading-relaxed text-muted ${bold}`}>{body}</p>
                    {link && <Link href={link[0]} className="mt-2 inline-flex items-center gap-1 text-sm">{link[1]}<ArrowRight className="size-3.5" aria-hidden /></Link>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section id="lakukan" className="grid scroll-mt-24 gap-6 md:grid-cols-2" aria-label="Lakukan dan hindari">
            {([['Lakukan', CircleCheck, Check, 'text-accent', DO], ['Hindari', CircleX, X, 'text-rose-300', DONT]] as const).map(([title, Icon, Mark, tone, items]) => (
              <div key={title} className="card">
                <h2 className="flex items-center gap-2"><Icon className={`size-5 ${tone}`} aria-hidden />{title}</h2>
                <ul className={`mt-4 space-y-3 text-sm leading-relaxed ${bold}`}>
                  {items.map((t, k) => <li key={k} className="flex gap-2.5"><Mark className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden /><span>{t}</span></li>)}
                </ul>
              </div>
            ))}
          </section>

          <section id="menu" className="card scroll-mt-24" aria-labelledby="h-menu">
            <h2 id="h-menu">Fitur tiap menu</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {menus.map(([label, Icon, href, items]) => (
                <article key={label} className="rounded-card border border-white/8 bg-white/4 p-4">
                  <h3 className="flex items-center gap-2 font-sans text-base font-semibold">
                    <Icon className="size-4.5 text-accent" aria-hidden /><Link href={href} className="text-ink">{label}</Link>
                  </h3>
                  <ul className={`mt-3 ${list}`}>{items.map((t, k) => <li key={k}>{t}</li>)}</ul>
                </article>
              ))}
            </div>
          </section>

          <section id="cara-kerja" className="card scroll-mt-24" aria-labelledby="h-cara-kerja">
            <h2 id="h-cara-kerja">Cara kerja sistem</h2>
            <ol className="mt-5 grid gap-4 md:grid-cols-2">
              {stages.map(([Icon, title, text], i) => (
                <li key={title} className="rounded-card border border-white/8 bg-white/4 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent/12 text-accent ring-1 ring-inset ring-accent/25"><Icon className="size-4.5" aria-hidden /></span>
                    <h3 className="font-sans text-base font-semibold"><span className="num text-muted">{i + 1}.</span> {title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ol>
            <h3 className="mt-6 font-sans text-base font-semibold">Penting diketahui</h3>
            <ul className={`mt-3 ${list}`}>{facts.map((t, k) => <li key={k}>{t}</li>)}</ul>
          </section>
        </div>
      </div>
    </>
  );
}
