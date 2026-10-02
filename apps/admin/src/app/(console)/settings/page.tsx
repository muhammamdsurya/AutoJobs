import { FlaskConical, QrCode, Smartphone } from 'lucide-react';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { getHook } from '@autojobs/shared/payments';
import { PORTAL_LABEL, PORTALS } from '@autojobs/shared/portals';
import { merchantName } from '@autojobs/shared/qris';
import { getQris, getSettings, MAX_DELAY_SEC, MIN_DELAY_SEC } from '@autojobs/shared/settings';
import { Badge, Field, fmtDateTime, Notice, PageHeader } from '@autojobs/shared/ui';
import { HOOK_RESULT, phoneQuiet } from '@/lib/hook';
import { createHookKey, saveAppSettings, uploadQris } from './actions';
import { requireAdmin } from '@autojobs/shared/auth';

const group = 'space-y-4 border-t border-white/8 pt-6';
const groupTitle = 'float-left mb-4 w-full font-display text-base font-semibold';
const fileInput = 'w-full min-w-0 text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-white/12 file:bg-white/6 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-white/10';

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, qris, hook] = await Promise.all([getSettings(), getQris(), getHook()]);

  return (
    <>
      <PageHeader title="Pengaturan" subtitle="QRIS dan notifikasi DANA untuk pembayaran token otomatis, lalu pengaturan antrean lamaran." />

      <section id="qris" className="card scroll-mt-28 space-y-5" aria-labelledby="h-qris">
        <div className="flex items-center gap-3">
          <QrCode className="size-5 text-accent" aria-hidden />
          <h2 id="h-qris">QRIS pembayaran</h2>
          {qris ? <Badge tone="green">aktif</Badge> : <Badge tone="amber">belum ada</Badge>}
        </div>
        <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:items-start">
          {qris ? (
            // Plain <img>: served by this console behind its own session cookie.
            <img src={`/api/files/qris/${qris.fileKey}`} alt="QRIS statis yang aktif" className="w-full max-w-48 rounded-card bg-white p-2" />
          ) : <div className="grid aspect-square max-w-48 place-items-center rounded-card border border-dashed border-white/15 text-sm text-muted">Belum ada QRIS</div>}
          <div className="space-y-4">
            {qris && <p className="text-sm">Merchant: <b>{merchantName(qris.payload) ?? '-'}</b></p>}
            <p className="text-sm leading-relaxed text-muted">
              Unggah QRIS <b className="text-ink">statis</b> akun DANA Bisnis Anda (gambar dari aplikasi). AutoJobs membaca kodenya dan membuat QR berisi nominal
              unik untuk setiap pembelian, sehingga pembayaran dikenali otomatis. Gambar aslinya ditampilkan sebagai cadangan &quot;QRIS statis&quot;.
            </p>
            <ActionForm action={uploadQris} resetOnOk className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input type="file" name="qris" accept="image/png,image/jpeg,image/webp" required aria-label="Gambar QRIS" className={fileInput} />
              <Submit className="btn btn-primary shrink-0">{qris ? 'Ganti QRIS' : 'Unggah QRIS'}</Submit>
            </ActionForm>
          </div>
        </div>
      </section>

      <section id="notifikasi" className="card scroll-mt-28 space-y-5" aria-labelledby="h-notifikasi">
        <div className="flex flex-wrap items-center gap-3">
          <Smartphone className="size-5 text-accent" aria-hidden />
          <h2 id="h-notifikasi">Notifikasi DANA (HP Android)</h2>
          {!hook.keyHash ? <Badge tone="amber">belum diatur</Badge> : phoneQuiet(hook) ? <Badge tone="red">tidak terdengar</Badge> : <Badge tone="green">terhubung</Badge>}
        </div>
        <p className="max-w-[75ch] text-sm leading-relaxed text-muted">
          HP Android yang memakai aplikasi DANA Bisnis meneruskan setiap notifikasi pembayaran masuk ke AutoJobs (lewat aplikasi gratis MacroDroid).
          AutoJobs membaca nominalnya lalu mengkreditkan pembelian dengan nominal unik itu. HP harus tetap menyala dan terhubung ke internet.
        </p>
        {hook.keyHash && (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {([
              ['Kunci dibuat', fmtDateTime(hook.createdAt)],
              ['Terakhir terhubung', hook.lastSeenAt ? fmtDateTime(hook.lastSeenAt) : 'belum pernah'],
              ['Notifikasi terakhir', hook.lastText ? `"${hook.lastText}" → ${HOOK_RESULT[hook.lastResult ?? ''] ?? hook.lastResult}` : 'belum ada'],
            ] as const).map(([k, v]) => <div key={k} className={k === 'Notifikasi terakhir' ? 'sm:col-span-3' : ''}><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 break-words tabular-nums">{v}</dd></div>)}
          </dl>
        )}
        <ActionForm action={createHookKey} className="space-y-2">
          <Submit className="btn btn-secondary" confirm={hook.keyHash ? 'Buat kunci baru? Alamat lama di MacroDroid berhenti bekerja.' : undefined}>
            {hook.keyHash ? 'Buat kunci baru' : 'Buat kunci'}
          </Submit>
          <p className="hint">Menghasilkan alamat rahasia untuk MacroDroid. Alamat hanya ditampilkan sekali; simpan baik-baik, siapa pun yang memilikinya bisa mengirim notifikasi palsu.</p>
        </ActionForm>
        <details className="border-t border-white/8 pt-4" open={!hook.lastSeenAt}>
          <summary className="text-sm font-medium text-accent hover:underline">Cara mengatur MacroDroid</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted marker:text-faint">
            <li>Pasang <b className="text-ink">MacroDroid</b> dari Play Store di HP yang memakai DANA Bisnis. Izinkan akses notifikasi, dan matikan optimasi baterai untuk MacroDroid dan DANA.</li>
            <li>Buat makro. Pemicu: <b className="text-ink">Notification Received</b> (Notifikasi diterima), pilih aplikasi DANA, teks <i>berisi</i> &quot;Rp&quot;.</li>
            <li>Aksi: <b className="text-ink">HTTP Request</b>, metode <b className="text-ink">POST</b>, URL = alamat dari tombol di atas. Isi (body): teks biasa, lalu sisipkan judul dan isi notifikasi lewat tombol magic text (…).</li>
            <li>Makro kedua: pemicu <b className="text-ink">Regular Interval</b> 15 menit, aksi HTTP Request POST ke alamat yang sama dengan isi <code className="num text-ink">ping</code>. Konsol jadi tahu HP masih terhubung.</li>
            <li>Uji: beli paket terkecil dan bayar QR-nya. Notifikasinya muncul di &quot;Notifikasi terakhir&quot; di atas dan token masuk otomatis.</li>
          </ol>
        </details>
      </section>

      <ActionForm action={saveAppSettings} className="card space-y-6">
        <h2>Antrean lamaran</h2>
        <fieldset className="space-y-4">
          <legend className={groupTitle}>Antrean</legend>
          <div className="clear-both grid gap-4 sm:grid-cols-2">
            <Field label="Jeda antar-putaran (detik)" hint={`Setelah tiap putaran (satu lamaran per portal berturut-turut). Antara ${MIN_DELAY_SEC} dan ${MAX_DELAY_SEC} detik.`}>
              <input className="input num" type="number" name="delaySec" min={MIN_DELAY_SEC} max={MAX_DELAY_SEC} defaultValue={settings.delaySec} />
            </Field>
            <Field label="Batas harian per akun portal"><input className="input num" type="number" name="dailyCap" min={1} max={500} defaultValue={settings.dailyCap} /></Field>
          </div>
        </fieldset>
        <fieldset className={group}>
          <legend className={groupTitle}>Pemantauan dan penyimpanan</legend>
          <div className="clear-both grid gap-4 sm:grid-cols-2">
            <Field label="Ambang peringatan gagal (%)" hint="Peringatan merah di Ringkasan bila, dari 20 percobaan terakhir sebuah portal (min. 5), sebanyak ini atau lebih berstatus Gagal: tanda alur lamaran portal itu kemungkinan rusak.">
              <input className="input num" type="number" name="alertFailurePercent" min={1} max={100} defaultValue={Math.round(settings.alertFailureRatio * 100)} />
            </Field>
            <Field label="Masa simpan tangkapan layar (hari)"><input className="input num" type="number" name="screenshotRetentionDays" min={1} max={3650} defaultValue={settings.screenshotRetentionDays} /></Field>
          </div>
        </fieldset>
        <fieldset className={group}>
          <legend className={groupTitle}>Portal aktif (kill switch)</legend>
          <div className="clear-both flex flex-wrap gap-2">
            {PORTALS.map((p) => (
              <label key={p} className="chip-toggle"><input type="checkbox" name={`enabled_${p}`} defaultChecked={settings.portalEnabled[p]} className="accent-accent" />{PORTAL_LABEL[p]}</label>
            ))}
          </div>
          <p className="hint">Portal nonaktif tidak dicari dan antreannya tertahan (tidak dibatalkan) sampai diaktifkan lagi.</p>
        </fieldset>
        <fieldset className="space-y-4 rounded-card border border-amber-300/25 bg-amber-400/[0.06] p-4 sm:p-5">
          <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-amber-200"><FlaskConical className="size-4" aria-hidden />Mode debug</legend>
          <label className="chip-toggle w-fit">
            <input type="checkbox" name="dryRunFast" defaultChecked={settings.dryRunFast} className="accent-accent" />Percepat uji coba (dry run)
          </label>
          <Field label="Jeda uji coba (detik)" hint="Jeda antar-putaran untuk uji coba. Lamaran sungguhan tetap memakai jeda di atas.">
            <input className="input num max-w-32" type="number" name="dryRunDelaySec" min={5} max={120} defaultValue={settings.dryRunDelaySec} />
          </Field>
        </fieldset>
        <div className="flex justify-end [&>button]:w-full sm:[&>button]:w-auto">
          <Submit>Simpan pengaturan</Submit>
        </div>
      </ActionForm>
    </>
  );
}
