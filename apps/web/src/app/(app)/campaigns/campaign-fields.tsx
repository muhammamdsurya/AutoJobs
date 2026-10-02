import { Field } from '@autojobs/shared/ui';
import { LEVELS } from '@/lib/filters';
import { PORTAL_LABEL, PORTALS, type Portal } from '@autojobs/shared/portals';
import type { Settings } from '@autojobs/shared/settings';

export type CampaignDefaults = {
  name: string; portals: Portal[]; positionInclude: string[]; positionExclude: string[]; descInclude: string[]; descMode: string;
  descExclude: string[]; experienceLevels: string[]; companyExclude: string[]; location: string; maxPages: number; maxListings: number;
};

export const EMPTY_CAMPAIGN: CampaignDefaults = {
  name: '', portals: [...PORTALS], positionInclude: [], positionExclude: [], descInclude: [], descMode: 'or', descExclude: [],
  experienceLevels: [], companyExclude: [], location: 'Indonesia', maxPages: 3, maxListings: 50,
};

const PORTAL_NOTE: Record<Portal, string> = {
  jobstreet: 'Pencarian dan lamaran otomatis.',
  glints: 'Pencarian dan lamaran lewat Chrome di komputer Anda (ekstensi).',
  linkedin: 'Pencarian dan Easy Apply lewat Chrome di komputer Anda. Lowongan eksternal dicatat untuk dilamar manual.',
};

// A checked tile or chip lights up with the accent; the native checkbox stays visible for keyboard and screen readers.
const tile = 'flex cursor-pointer gap-3 rounded-card border border-white/10 bg-white/4 p-4 text-sm transition-colors hover:border-white/20 has-[:checked]:border-accent/55 has-[:checked]:bg-accent/8 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';
const groupTitle = 'font-display text-base font-semibold';

// Criteria form fields shared by "Pencarian baru" and "Ubah kriteria".
export function CampaignFields({ d, settings }: { d: CampaignDefaults; settings: Settings }) {
  const join = (v: string[]) => v.join(', ');
  return (
    <>
      <fieldset className="space-y-4">
        <legend className={groupTitle}>Nama dan portal</legend>
        <Field label="Nama pencarian (opsional)"><input className="input max-w-md" name="name" defaultValue={d.name} placeholder="Data Analyst Jakarta" /></Field>
        <div>
          <span className="label">Portal</span>
          <div className="grid gap-3 sm:grid-cols-3">
            {PORTALS.map((p) => (
              <label key={p} className={tile}>
                <input type="checkbox" name="portals" value={p} defaultChecked={settings.portalEnabled[p] && d.portals.includes(p)} disabled={!settings.portalEnabled[p]}
                  className="mt-0.5 size-4.5 shrink-0 accent-accent" />
                <span>
                  <span className="block font-medium">{PORTAL_LABEL[p]}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{settings.portalEnabled[p] ? PORTAL_NOTE[p] : 'Sedang dinonaktifkan admin.'}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-white/8 pt-6">
        <legend className={`${groupTitle} float-left mb-4 w-full`}>Kata kunci</legend>
        <div className="clear-both grid gap-5 sm:grid-cols-2">
          <Field
            label="Posisi: kata kunci judul"
            hint="Pisahkan dengan koma; cocok bila salah satu ada di judul lowongan. Judul di portal Indonesia bisa berbahasa Indonesia atau Inggris, jadi masukkan keduanya, mis. Analis Laboratorium, Laboratory Analyst, Chemist."
          >
            <input className="input" name="positionInclude" defaultValue={join(d.positionInclude)} placeholder="Data Analyst, Analis Data" required />
          </Field>
          <Field label="Kecualikan judul yang memuat" hint="Mis. Intern, Magang. Juga mengecualikan kata turunannya (Internship).">
            <input className="input" name="positionExclude" defaultValue={join(d.positionExclude)} placeholder="Intern, Magang" />
          </Field>
          <div>
            <Field label="Deskripsi harus memuat" hint="Dicocokkan dengan isi deskripsi. Pakai kata tunggal (mis. SQL, kimia); frasa panjang jarang tertulis persis.">
              <input className="input" name="descInclude" defaultValue={join(d.descInclude)} placeholder="SQL, Python" />
            </Field>
            <div className="mt-3 inline-flex rounded-control border border-white/12 bg-white/4 p-1 text-sm" role="radiogroup" aria-label="Cara mencocokkan deskripsi">
              {([['or', 'Salah satu (ATAU)'], ['and', 'Semuanya (DAN)']] as const).map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 rounded-chip px-3 py-1.5 text-muted transition-colors has-[:checked]:bg-accent/15 has-[:checked]:text-teal-100">
                  <input type="radio" name="descMode" value={v} defaultChecked={v === 'and' ? d.descMode === 'and' : d.descMode !== 'and'} className="accent-accent" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Deskripsi tidak boleh memuat"><input className="input" name="descExclude" defaultValue={join(d.descExclude)} placeholder="sales target, door to door" /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-white/8 pt-6">
        <legend className={`${groupTitle} float-left mb-4 w-full`}>Saringan</legend>
        <div className="clear-both">
          <span className="label">Level pengalaman</span>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <label key={l.key} className="chip-toggle">
                <input type="checkbox" name="experienceLevels" value={l.key} defaultChecked={d.experienceLevels.includes(l.key)} className="accent-accent" /> {l.label}
              </label>
            ))}
          </div>
          <p className="hint">Kosongkan untuk semua level. Lowongan yang levelnya tidak tercantum tetap ditampilkan dengan tanda &quot;level tidak diketahui&quot;.</p>
        </div>
        <div className="grid gap-5 pt-2 sm:grid-cols-2">
          <Field label="Kecualikan perusahaan" hint="Pisahkan dengan koma."><input className="input" name="companyExclude" defaultValue={join(d.companyExclude)} placeholder="PT Contoh Abadi" /></Field>
          <Field label="Lokasi" hint="Isi Indonesia untuk seluruh Indonesia, atau kota/provinsi seperti Jakarta Raya."><input className="input" name="location" defaultValue={d.location} /></Field>
        </div>
      </fieldset>

      <fieldset className="border-t border-white/8 pt-6">
        <legend className={`${groupTitle} float-left mb-4 w-full`}>Batas</legend>
        <div className="clear-both grid gap-5 sm:grid-cols-2">
          <Field label="Maksimal halaman per kata kunci" hint="Halaman hasil pencarian yang dibuka untuk tiap kata kunci posisi di tiap portal (satu halaman berisi 10-30 lowongan, tergantung portal). Berhenti lebih awal bila batas lowongan per portal sudah tercapai.">
            <input className="input num max-w-32" name="maxPages" type="number" min={1} max={10} defaultValue={d.maxPages} />
          </Field>
          <Field label="Maksimal lowongan per portal" hint="Pencarian di tiap portal berhenti setelah menemukan sebanyak ini lowongan yang judulnya cocok, atau setelah halamannya habis. Antara 10 dan 100.">
            <input className="input num max-w-32" name="maxListings" type="number" min={10} max={100} defaultValue={d.maxListings} />
          </Field>
        </div>
      </fieldset>
    </>
  );
}
