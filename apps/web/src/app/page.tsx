import {
  ArrowRight, BriefcaseBusiness, CircleCheck, Clock, Download, FlaskConical, Filter, GraduationCap, KeyRound, ListChecks, Mail, MapPin,
  MessageCircle, MessageSquareText, Puzzle, Route, Send, SlidersHorizontal, UserRound, X, Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo, PackList } from '@autojobs/shared/ui';
import { currentUser } from '@autojobs/shared/auth';
import { PORTALS } from '@autojobs/shared/portals';
import { getSettings } from '@autojobs/shared/settings';
import { getPacks } from '@autojobs/shared/payments';
import { FREE_SEARCHES } from '@autojobs/shared/tokens';

const TITLE = 'AutoJobs: Lamar Kerja Otomatis di JobStreet, Glints & LinkedIn';
const DESCRIPTION =
  'Cari loker dan lamar kerja otomatis di JobStreet, Glints, dan LinkedIn dari satu profil. Hanya lowongan yang cocok, formulir terisi sendiri. Coba 3x gratis.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
};

// The manual way next to the AutoJobs way.
const COMPARE = [
  ['Membuka JobStreet, Glints, dan LinkedIn satu per satu', 'Satu pencarian untuk tiga portal sekaligus'],
  ['Mengetik data diri dan mengunggah CV di setiap lamaran', 'Profil dan CV diisi sekali, dipakai di semua portal'],
  ['Menjawab pertanyaan yang sama berulang kali', 'Jawaban tersimpan dan terisi otomatis'],
  ['Memilah ratusan lowongan yang tidak relevan', 'Hanya lowongan yang cocok dengan posisi dan level Anda'],
  ['Lupa sudah melamar ke mana saja', 'Semua lamaran di satu laporan, lengkap dengan buktinya'],
];

const STEPS = [
  { icon: KeyRound, title: 'Daftar gratis', text: 'Pakai email atau akun Google. Langsung dapat 3x Cari Loker.' },
  { icon: UserRound, title: 'Lengkapi profil dan CV', text: 'Sekali isi, dipakai untuk setiap lamaran di tiga portal.' },
  { icon: Puzzle, title: 'Hubungkan Chrome', text: 'Pasang ekstensi AutoJobs, lalu masuk ke JobStreet, Glints, dan LinkedIn seperti biasa.' },
  { icon: SlidersHorizontal, title: 'Cari loker', text: 'Tulis posisi, lokasi, dan level yang Anda incar. AutoJobs mencarinya di tiga portal sekaligus.' },
  { icon: ListChecks, title: 'Pilih lowongan', text: 'Setiap lowongan disertai alasan kenapa cocok. Centang yang ingin Anda lamar.' },
  { icon: Send, title: 'Lamaran terkirim otomatis', text: 'Dikirim satu per satu dengan jeda aman. Pantau hasilnya di Laporan, dari laptop maupun HP.' },
];

const FEATURES = [
  { icon: Filter, title: 'Hanya lowongan yang cocok', text: 'Saring berdasarkan judul, isi deskripsi, level pengalaman, dan perusahaan yang ingin dihindari.' },
  { icon: MessageSquareText, title: 'Pertanyaan terjawab otomatis', text: 'Pertanyaan dari perusahaan diisi dari profil Anda. Pertanyaan baru cukup dijawab sekali.' },
  { icon: FlaskConical, title: 'Coba dulu tanpa mengirim', text: 'Mode uji coba mengisi formulir sampai akhir tanpa menekan kirim, jadi Anda bisa yakin dulu.' },
  { icon: Download, title: 'Semua lamaran di satu laporan', text: 'Status tiap lamaran, bukti pengiriman, dan unduhan Excel untuk lamaran yang terkirim.' },
];

const AUDIENCE = [
  {
    icon: GraduationCap, title: 'Fresh graduate',
    text: 'Kirim lamaran ke puluhan lowongan entry level tanpa mengetik ulang data yang sama. Lowongan senior tersaring otomatis.',
  },
  {
    icon: BriefcaseBusiness, title: 'Karyawan yang ingin pindah kerja',
    text: 'Tidak sempat melamar di jam kerja? Pilih lowongan saat istirahat, lamarannya terkirim sendiri selama Chrome Anda terbuka.',
  },
  {
    icon: Route, title: 'Pindah bidang karier',
    text: 'Cari beberapa posisi sekaligus, misalnya Data Analyst dan Business Intelligence, lalu bandingkan hasilnya dari tiga portal.',
  },
];

const FAQ = [
  ['Portal apa saja yang didukung?', 'JobStreet, Glints, dan LinkedIn. Di LinkedIn, lowongan Easy Apply dilamar otomatis; lowongan yang melamar di situs perusahaan dicatat beserta tautannya.'],
  ['Apa yang dihitung sebagai 1 token?', `Satu kali Cari Loker. Mengubah kriteria atau mencari ulang sebelum lamaran diluncurkan tidak memakai token lagi. Setiap akun mendapat ${FREE_SEARCHES}x Cari Loker gratis; setelah itu isi token sesuai kebutuhan, dibayar lewat QRIS.`],
  ['Bagaimana dengan pertanyaan dari perusahaan?', 'Dijawab otomatis dari profil Anda. Pertanyaan wajib yang baru tidak ditebak: Anda menjawabnya sekali, lalu lamarannya dilanjutkan.'],
  ['Apakah komputer harus menyala?', 'Ya. Lamaran dikirim dari Chrome di komputer Anda, jadi biarkan Chrome terbuka selama antrean berjalan. Hasilnya bisa dipantau dari HP.'],
  ['Apakah akun portal saya bisa dibatasi?', 'Bisa. Ketiga portal membatasi otomatisasi dalam ketentuan mereka. AutoJobs memberi jeda antar-lamaran dan batas harian, dan Anda sendiri yang meluncurkan setiap pencarian.'],
  ['Bisakah saya mencoba tanpa mengirim lamaran?', 'Bisa. Mode uji coba mengisi formulir sampai akhir tanpa menekan tombol kirim.'],
] as const;

const CONTACT = {
  email: 'muhammadsurya2812@gmail.com',
  whatsapp: '6281932764494',
  whatsappLabel: '+62 819-3276-4494',
  address: 'Jl. Raya Condet No. 21, Jakarta',
  hours: 'Setiap hari, 09.00-18.00 WIB',
};

export default async function Home() {
  if (await currentUser()) redirect('/campaigns');
  const { dailyCap } = await getSettings();
  const packs = await getPacks(); // edited in the admin console
  // Product facts, not marketing estimates; the daily limit is the live Admin setting.
  const stats: [string, string][] = [
    [String(PORTALS.length), 'portal dalam satu pencarian'],
    [String(dailyCap * PORTALS.length), `lamaran otomatis per hari, hingga ${dailyCap} per portal`],
    ['1x', 'isi profil dan CV untuk semua lamaran'],
  ];
  const sections: [string, string][] = [
    ['keuntungan', 'Keuntungan'], ['cara-pakai', 'Cara pakai'], ['fitur', 'Fitur'], ['untuk-siapa', 'Untuk siapa'], ['harga', 'Harga'], ['faq', 'FAQ'],
  ];
  const sectionLink = 'shrink-0 rounded-control px-3 py-2 text-sm text-muted no-underline transition-colors hover:bg-white/6 hover:text-ink hover:no-underline';
  const footerLink = 'text-sm text-muted no-underline transition-colors hover:text-ink hover:no-underline';
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'AutoJobs', url: base, description: DESCRIPTION,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Google Chrome', inLanguage: 'id-ID',
      offers: { '@type': 'AggregateOffer', priceCurrency: 'IDR', lowPrice: 0, highPrice: Math.max(0, ...packs.map((p) => p.price)), offerCount: packs.length + 1 },
      image: `${base}/og.jpg`,
      creator: { '@type': 'Organization', name: 'Ayrus Digital Teknologi', url: 'https://ayrusdigital.my.id', email: CONTACT.email, logo: `${base}/ayrus-logo.png` },
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];

  return (
    <div className="overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <a href="#konten" className="skip-link">Langsung ke konten</a>
      <header className="glass-bar sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
          <Logo href="/" />
          <nav className="ml-6 hidden items-center gap-0.5 lg:flex" aria-label="Bagian halaman">
            {sections.map(([id, label]) => <a key={id} href={`#${id}`} className={sectionLink}>{label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/login" className="btn btn-quiet">Masuk</Link>
            <Link href="/signup" className="btn btn-primary">Mulai gratis</Link>
          </div>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto border-t border-white/8 px-2 py-1 [scrollbar-width:none] lg:hidden" aria-label="Bagian halaman">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} className={sectionLink}>{label}</a>)}
        </nav>
      </header>

      <main id="konten">
        {/* Hero: the promise on the left, the pitch on the right, then the real product underneath. */}
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:pt-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end lg:gap-14">
            <div className="rise">
              <h1 className="mt-5 text-[2.5rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl">
                Lamar kerja otomatis, <span className="text-accent">tanpa isi formulir</span> satu per satu.
              </h1>
            </div>
            <div className="rise" style={{ '--i': 2 } as React.CSSProperties}>
              <p className="max-w-[46ch] text-lg leading-relaxed text-muted">
                Cari loker dari beberapa portal sekaligus. AutoJobs memilih lowongan yang pas untuk Anda dan mengisi formulir lamarannya, jadi Anda
                bisa fokus menyiapkan interview.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href="/signup" className="btn btn-primary h-12 px-6 text-base">Mulai gratis<ArrowRight aria-hidden /></Link>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  {[`${FREE_SEARCHES}x Cari Loker gratis`, 'Tanpa kartu kredit'].map((t) => (
                    <span key={t} className="flex items-center gap-1.5"><CircleCheck className="size-4 text-accent" aria-hidden />{t}</span>
                  ))}
                </p>
              </div>
            </div>
          </div>

          <figure className="rise relative mt-12 pb-10 sm:mt-16 sm:pb-14" style={{ '--i': 3 } as React.CSSProperties}>
            <div className="glass rounded-panel p-1.5 sm:p-2">
              <Image
                src="/landing/app-desktop.png" width={2560} height={1600} preload sizes="(min-width: 1152px) 1120px, 100vw"
                alt="Dashboard AutoJobs: lamaran otomatis berjalan di JobStreet, Glints, dan LinkedIn dengan antrean dan batas harian per portal."
                className="h-auto w-full rounded-card"
              />
            </div>
            <div className="glass absolute bottom-0 right-3 w-[30%] max-w-64 rounded-panel p-1 sm:right-6 sm:w-[22%] sm:p-1.5 lg:-right-4">
              <Image
                src="/landing/app-mobile.png" width={780} height={1688} sizes="(min-width: 640px) 256px, 30vw"
                alt="Daftar loker yang cocok di HP, lengkap dengan alasan kecocokan tiap lowongan."
                className="h-auto w-full rounded-card"
              />
            </div>
            <figcaption className="sr-only">Tangkapan layar AutoJobs dengan data contoh.</figcaption>
          </figure>
        </section>

        {/* Benefits: product facts, then the manual way next to the AutoJobs way. */}
        <section id="keuntungan" className="mx-auto max-w-6xl scroll-mt-32 px-4 pt-20 sm:pt-28 lg:scroll-mt-20">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Waktu Anda untuk persiapan interview, <span className="text-accent">bukan untuk mengetik data yang sama</span>.
          </h2>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-muted">
            Formulir, CV, dan pertanyaan yang sama di tiga portal? Biar AutoJobs yang mengerjakan. Anda cukup memilih lowongannya.
          </p>
          <dl className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-3">
            {stats.map(([n, label]) => (
              <div key={label} className="flex flex-col-reverse justify-end border-t border-white/10 pt-4">
                <dt className="mt-1 max-w-[26ch] text-sm leading-snug text-muted">{label}</dt>
                <dd className="num text-4xl font-semibold text-ink sm:text-5xl">{n}</dd>
              </div>
            ))}
          </dl>
          <div className="glass mt-12 overflow-hidden rounded-panel">
            <div className="hidden grid-cols-2 border-b border-white/8 md:grid" aria-hidden>
              <p className="px-6 py-4 text-sm font-medium text-muted">Cara manual</p>
              <p className="flex items-center gap-2 border-l border-white/8 bg-accent/[0.06] px-6 py-4 text-sm font-semibold text-accent"><Zap className="size-4" />Dengan AutoJobs</p>
            </div>
            <ul className="divide-y divide-white/6">
              {COMPARE.map(([before, after]) => (
                <li key={before} className="grid md:grid-cols-2">
                  <p className="flex gap-3 px-5 pt-4 text-sm leading-relaxed text-muted md:px-6 md:py-4">
                    <X className="mt-0.5 size-4 shrink-0 text-rose-300/80" aria-hidden /><span><span className="sr-only">Cara manual: </span>{before}</span>
                  </p>
                  <p className="flex gap-3 px-5 pb-4 pt-2 text-sm font-medium leading-relaxed md:border-l md:border-white/8 md:bg-accent/[0.06] md:px-6 md:py-4">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /><span><span className="sr-only">Dengan AutoJobs: </span>{after}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How to use it: a vertical sequence next to a sticky heading. */}
        <section id="cara-pakai" className="mx-auto grid max-w-6xl scroll-mt-32 gap-10 px-4 py-20 sm:py-28 lg:scroll-mt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cara lamar kerja otomatis dengan AutoJobs</h2>
            <p className="mt-4 max-w-[40ch] leading-relaxed text-muted">Sekali siapkan. Selanjutnya cukup pilih lowongan dan luncurkan.</p>
            <Link href="/signup" className="btn btn-primary mt-6 hidden lg:inline-flex">Mulai gratis<ArrowRight aria-hidden /></Link>
          </div>
          <ol className="relative ml-[1.125rem] space-y-10 border-l border-white/10 pl-8 sm:pl-10 lg:ml-0">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative">
                <span className="absolute -left-[calc(3.125rem+0.5px)] top-0 grid size-9 place-items-center rounded-control bg-canvas text-accent ring-1 ring-inset ring-white/15 sm:-left-[calc(3.625rem+0.5px)]">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <p className="num text-xs text-muted">Langkah {String(i + 1).padStart(2, '0')}</p>
                <h3 className="mt-1 text-xl font-semibold">{title}</h3>
                <p className="mt-2 max-w-[52ch] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features: open grid, no boxes. */}
        <section id="fitur" className="mx-auto max-w-6xl scroll-mt-32 px-4 pb-20 sm:pb-28 lg:scroll-mt-20">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Lebih banyak lamaran, tetap tepat sasaran</h2>
          <ul className="mt-10 grid gap-x-12 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 border-t border-white/10 py-6">
                <Icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                <div>
                  <h3 className="font-sans text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 max-w-[50ch] text-sm leading-relaxed text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Who it is for: one row per situation. */}
        <section id="untuk-siapa" className="mx-auto max-w-6xl scroll-mt-32 px-4 pb-20 sm:pb-28 lg:scroll-mt-20">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Dibuat untuk Anda yang sedang cari kerja</h2>
          <ul className="panel mt-10 divide-y divide-white/8 py-2 sm:py-2">
            {AUDIENCE.map(({ icon: Icon, title, text }) => (
              <li key={title} className="grid gap-3 py-6 md:grid-cols-[18rem_minmax(0,1fr)] md:items-center md:gap-10">
                <h3 className="flex items-center gap-3 text-xl font-semibold">
                  <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent/10 text-accent ring-1 ring-inset ring-accent/25"><Icon className="size-5" aria-hidden /></span>
                  {title}
                </h3>
                <p className="max-w-[60ch] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Pricing: the free start on the left, token packs on the right. */}
        <section id="harga" className="mx-auto max-w-6xl scroll-mt-32 px-4 pb-20 sm:pb-28 lg:scroll-mt-20">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Mulai gratis, bayar sesuai kebutuhan</h2>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">Tanpa langganan. Bayar hanya saat Anda mencari loker.</p>
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div className="panel">
              <p className="text-sm text-muted">Untuk memulai</p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">Gratis <span className="num">{FREE_SEARCHES}</span>x Cari Loker</p>
              <p className="mt-3 max-w-[42ch] leading-relaxed text-muted">Rasakan sendiri lamaran pertama Anda terkirim otomatis.</p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {['Pencarian di JobStreet, Glints, dan LinkedIn', 'Saringan judul, deskripsi, dan level', 'Laporan lengkap dan unduhan Excel'].map((t) => (
                  <li key={t} className="flex gap-2.5"><CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />{t}</li>
                ))}
              </ul>
              <Link href="/signup" className="btn btn-primary mt-8 h-12 px-6 text-base">Mulai gratis<ArrowRight aria-hidden /></Link>
            </div>
            <div>
              <h3 className="text-xl font-semibold">Setelah itu, isi token</h3>
              <p className="mt-2 text-muted"><b className="text-ink">1 token = 1x Cari Loker.</b> Makin banyak, makin hemat.</p>
              <PackList packs={packs} className="mt-6" />
            </div>
          </div>
        </section>

        {/* FAQ: side-by-side answers, no accordion. */}
        <section id="faq" className="mx-auto max-w-6xl scroll-mt-32 px-4 pb-20 sm:pb-28 lg:scroll-mt-20">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Pertanyaan yang sering diajukan</h2>
          <dl className="mt-10 grid gap-x-12 md:grid-cols-2">
            {FAQ.map(([q, a]) => (
              <div key={q} className="border-t border-white/10 py-6">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Closing call to action. */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="panel flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lebih banyak lamaran, lebih sedikit mengetik.</h2>
              <p className="mt-2 leading-relaxed text-muted">{FREE_SEARCHES}x Cari Loker gratis, tanpa kartu kredit.</p>
            </div>
            <Link href="/signup" className="btn btn-primary h-12 shrink-0 px-6 text-base">Mulai gratis<ArrowRight aria-hidden /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 bg-canvas/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.3fr)]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo href="/" />
            <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-muted">
              Lamar kerja otomatis di JobStreet, Glints, dan LinkedIn dari satu profil. Hanya lowongan yang cocok, formulir terisi sendiri.
            </p>
            <a href="https://ayrusdigital.my.id" target="_blank" rel="noopener" className="mt-6 inline-flex items-center gap-3 rounded-card border border-white/10 bg-white/4 py-2 pl-2 pr-4 no-underline transition-colors hover:border-white/20 hover:no-underline">
              <Image src="/ayrus-logo.png" width={36} height={36} alt="" className="size-9" />
              <span className="text-xs leading-tight text-muted">Dibuat oleh<span className="block text-sm font-semibold text-ink">Ayrus Digital Teknologi</span></span>
            </a>
          </div>
          <nav aria-labelledby="f-nav">
            <h2 id="f-nav" className="font-sans text-sm font-semibold">Navigasi</h2>
            <ul className="mt-4 space-y-2.5">
              {sections.map(([id, label]) => <li key={id}><a href={`#${id}`} className={footerLink}>{label}</a></li>)}
              <li><Link href="/signup" className={footerLink}>Daftar gratis</Link></li>
              <li><Link href="/login" className={footerLink}>Masuk</Link></li>
            </ul>
          </nav>
          <nav aria-labelledby="f-legal">
            <h2 id="f-legal" className="font-sans text-sm font-semibold">Legal</h2>
            <ul className="mt-4 space-y-2.5">
              <li><Link href="/legal" className={footerLink}>Ketentuan Layanan</Link></li>
              <li><Link href="/legal#privasi" className={footerLink}>Kebijakan Privasi</Link></li>
            </ul>
          </nav>
          <div>
            <h2 className="font-sans text-sm font-semibold">Kontak</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li><a href={`mailto:${CONTACT.email}`} className={`${footerLink} inline-flex items-start gap-2 [overflow-wrap:anywhere]`}><Mail className="mt-0.5 size-4 shrink-0" aria-hidden />{CONTACT.email}</a></li>
              <li>
                <a href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Halo, saya ingin bertanya tentang AutoJobs.')}`} target="_blank" rel="noopener" className={`${footerLink} inline-flex items-start gap-2`}>
                  <MessageCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{CONTACT.whatsappLabel} (WhatsApp)
                </a>
              </li>
              <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{CONTACT.address}</li>
              <li className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />{CONTACT.hours}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/8">
          <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted">
            © {new Date().getFullYear()} Muhammad Surya Rusfauzi (Ayrus Digital Teknologi). Seluruh hak cipta dilindungi.
          </p>
        </div>
      </footer>
    </div>
  );
}
