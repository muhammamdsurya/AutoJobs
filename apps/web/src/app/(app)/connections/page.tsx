import { CircleCheck, CircleHelp, CircleMinus, CircleX, Download, Puzzle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { Badge, Field, fmtDateTime, Meter, Notice, PageHeader, type Tone } from '@autojobs/shared/ui';
import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';
import { extensionLastSeen, isOnline } from '@/lib/extension';
import { extensionVersion } from '@/lib/extension-package';
import { AUTO_APPLY, PORTAL_FIELDS, PORTAL_LABEL, PORTALS, type Portal } from '@autojobs/shared/portals';
import { submittedToday } from '@/lib/queue';
import { getSettings } from '@autojobs/shared/settings';
import { newPairingCode, savePortalFields, unpairAll } from './actions';

const STATE: Record<string, [string, Tone, LucideIcon]> = {
  unknown: ['Belum diperiksa', 'gray', CircleHelp],
  connected: ['Sudah masuk', 'green', CircleCheck],
  expired: ['Belum masuk', 'red', CircleX],
  needs_verification: ['Perlu verifikasi', 'amber', TriangleAlert],
};

export default async function ConnectionsPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const sent = await submittedToday(user.id);
  const [{ paired }] = await sql<{ paired: number }[]>`select count(*)::int as paired from extension_tokens where user_id = ${user.id}`;
  const lastSeen = await extensionLastSeen(user.id);
  const online = isOnline(lastSeen);
  const rows = await sql<{ portal: Portal; status: string; lastVerifiedAt: Date | null }[]>`
    select portal, status, last_verified_at from portal_accounts where user_id = ${user.id}`;
  const extras = await sql<{ portal: string; fieldKey: string; value: string }[]>`select portal, field_key, value from portal_extra_fields where user_id = ${user.id}`;
  const extra = (portal: string, key: string) => extras.find((e) => e.portal === portal && e.fieldKey === key)?.value ?? '';
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  const steps: React.ReactNode[] = [
    <>
      Unduh ekstensi AutoJobs (versi <span className="num">{await extensionVersion()}</span>), lalu ekstrak zip-nya ke folder tetap, mis.{' '}
      <code>Dokumen\AutoJobs</code>. Jangan hapus atau pindahkan folder itu: Chrome memakainya langsung.
      <a href="/autojobs-extension.zip" download className="btn btn-secondary mt-3 flex w-fit no-underline hover:no-underline"><Download aria-hidden />Unduh ekstensi (.zip)</a>
    </>,
    <>Di Chrome atau Edge di komputer, buka <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>), aktifkan <i>Mode pengembang</i>, klik <i>Load unpacked</i>, lalu pilih folder hasil ekstrak tadi (yang berisi <code>manifest.json</code>).</>,
    <>Klik &quot;Buat kode pairing&quot;, lalu masukkan kodenya di popup ekstensi (ikon AutoJobs di toolbar). Alamat <code>{appUrl}</code> sudah terisi.</>,
    <>Masuk ke JobStreet, Glints, dan LinkedIn di Chrome yang sama seperti biasa. Bila muncul CAPTCHA atau kode verifikasi, selesaikan sendiri, lalu klik &quot;Periksa login portal&quot; di popup ekstensi.</>,
    <>Biarkan Chrome terbuka selama pencarian berjalan. Ekstensi melamar di jendela &quot;AutoJobs&quot; tersendiri, satu per satu: satu lamaran di tiap portal berturut-turut, lalu jeda <span className="num">{settings.delaySec}</span> detik.</>,
  ];

  return (
    <>
      <PageHeader
        title="Koneksi Portal"
        subtitle="Lamaran dikirim oleh ekstensi AutoJobs di Chrome Anda sendiri, memakai login portal Anda di Chrome itu. AutoJobs tidak menyimpan kata sandi atau sesi portal."
      />

      {/* Touch screens only (phones, tablets): mobile Chrome can't run extensions, so say where the applying happens. */}
      <div className="hidden pointer-coarse:block">
        <Notice tone="blue">
          <p className="font-medium text-ink">Anda membuka AutoJobs dari HP</p>
          <p className="mt-1">
            Chrome di HP belum mendukung ekstensi, jadi ekstensi AutoJobs dipasang di Chrome atau Edge di komputer (Windows, Mac, Linux,
            atau Chromebook) dan lamaran dikirim dari sana. Dari HP Anda tetap bisa membuat pencarian, memilih lowongan, memantau
            Laporan, dan menjawab pertanyaan.
          </p>
        </Notice>
      </div>

      <section className="card" aria-labelledby="h-ext">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white/6 text-accent ring-1 ring-inset ring-white/10"><Puzzle className="size-4.5" aria-hidden /></span>
          <h2 id="h-ext">Ekstensi Chrome AutoJobs</h2>
          {!paired
            ? <Badge><CircleMinus aria-hidden />Belum dipasangkan</Badge>
            : online ? <Badge tone="green"><CircleCheck aria-hidden />Aktif</Badge> : <Badge tone="amber"><TriangleAlert aria-hidden />Tidak aktif</Badge>}
          {lastSeen && <span className="text-xs tabular-nums text-muted">terakhir terlihat {fmtDateTime(lastSeen)}</span>}
        </div>
        <ol className="mt-5 space-y-4 text-sm leading-relaxed">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="num grid size-6 shrink-0 place-items-center rounded-chip bg-white/8 text-xs text-ink ring-1 ring-inset ring-white/10">{i + 1}</span>
              <p className="max-w-[75ch] text-muted [&_code]:rounded-chip [&_code]:bg-white/8 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-ink">{s}</p>
            </li>
          ))}
        </ol>
        <p className="hint mt-4">
          Ada versi baru? Unduh lagi, timpa isi folder yang sama, lalu klik ikon muat ulang pada AutoJobs di halaman ekstensi.
        </p>
        <div className="mt-5 flex flex-wrap items-start gap-2 border-t border-white/8 pt-5">
          <ActionForm action={newPairingCode}>
            <Submit>Buat kode pairing</Submit>
          </ActionForm>
          {paired > 0 && (
            <form action={unpairAll}><Submit className="btn btn-danger" confirm="Putuskan semua ekstensi dari akun ini?">Putuskan ekstensi</Submit></form>
          )}
        </div>
        {paired > 0 && !online && (
          <div className="mt-4"><Notice>Ekstensi tidak aktif: Chrome tertutup atau ekstensi dimatikan. Lamaran yang antre menunggu sampai Chrome dibuka lagi.</Notice></div>
        )}
        {!paired && (
          <div className="mt-4">
            <Notice tone="blue">
              Ekstensi sudah terpasang tapi menampilkan email lain? Ekstensi terhubung ke akun yang membuat kode pairing-nya, bukan ke akun yang
              sedang masuk di sini. Di popup ekstensi klik <b>Putuskan</b>, lalu pasangkan lagi dengan kode baru dari halaman ini.
            </Notice>
          </div>
        )}
      </section>

      {PORTALS.map((portal) => {
        const acct = rows.find((r) => r.portal === portal);
        const [stateLabel, tone, StateIcon] = STATE[acct?.status ?? 'unknown'];
        const label = PORTAL_LABEL[portal];
        return (
          <section key={portal} className="card" aria-labelledby={`h-${portal}`}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={`h-${portal}`}>{label}</h2>
              {AUTO_APPLY[portal] ? <Badge tone={tone}><StateIcon aria-hidden />{stateLabel}</Badge> : <Badge>Hanya pencarian</Badge>}
              {!settings.portalEnabled[portal] && <Badge tone="red"><CircleX aria-hidden />Dinonaktifkan admin</Badge>}
            </div>
            {AUTO_APPLY[portal] ? (
              <div className={`mt-5 grid gap-6 ${PORTAL_FIELDS[portal].length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
                <div className="space-y-4">
                  <div className="max-w-md">
                    <Meter value={sent[portal] ?? 0} max={settings.dailyCap} label="Terkirim hari ini (batas harian)" />
                  </div>
                  {acct?.lastVerifiedAt && <p className="text-xs tabular-nums text-muted">Login diperiksa ekstensi {fmtDateTime(acct.lastVerifiedAt)}</p>}
                  {acct?.status === 'expired' && <Notice tone="red">Anda belum masuk ke {label} di Chrome yang dipasangi ekstensi. Masuk dulu, lalu klik &quot;Periksa login portal&quot; di popup ekstensi.</Notice>}
                  {acct?.status === 'needs_verification' && <Notice>{label} meminta verifikasi (CAPTCHA/kode). Buka {label} di Chrome, selesaikan verifikasinya, lalu klik &quot;Periksa login portal&quot;.</Notice>}
                  {portal === 'glints' && <p className="max-w-[65ch] text-sm leading-relaxed text-muted">Pencarian Glints juga berjalan lewat Chrome di komputer Anda, karena Glints hanya melayani browser yang sudah Anda verifikasi.</p>}
                  {portal === 'linkedin' && <p className="max-w-[65ch] text-sm leading-relaxed text-muted">Hanya lowongan Easy Apply yang dilamar otomatis. Lowongan yang melamar di situs perusahaan dicatat di Laporan untuk dilamar manual beserta tautannya.</p>}
                </div>
                {PORTAL_FIELDS[portal].length > 0 && (
                  <ActionForm action={savePortalFields.bind(null, portal)} className="space-y-3 border-t border-white/8 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <h3 className="font-sans text-sm font-semibold">Isian khusus {label}</h3>
                    {PORTAL_FIELDS[portal].map((f) => (
                      <Field key={f.key} label={f.label} hint={f.hint}>
                        {f.type === 'textarea'
                          ? <textarea className="input min-h-28" name={f.key} defaultValue={extra(portal, f.key)} />
                          : <input className="input num max-w-xs" name={f.key} inputMode="numeric" defaultValue={extra(portal, f.key)} />}
                      </Field>
                    ))}
                    <Submit className="btn btn-secondary">Simpan isian {label}</Submit>
                  </ActionForm>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
