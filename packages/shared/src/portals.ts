// Portal metadata shared by UI, worker and adapters. No heavy imports: client components may use it.

export const PORTALS = ['jobstreet', 'glints', 'linkedin'] as const;
export type Portal = (typeof PORTALS)[number];
export const isPortal = (s: unknown): s is Portal => PORTALS.includes(s as Portal);

export const PORTAL_LABEL: Record<Portal, string> = { jobstreet: 'JobStreet', glints: 'Glints', linkedin: 'LinkedIn' };

// Portals AutoJobs applies on (LinkedIn: Easy Apply only; "apply on company site" jobs stay manual).
export const AUTO_APPLY: Record<Portal, boolean> = { jobstreet: true, glints: true, linkedin: true };

// PR-04: fields only a given portal asks for, stored in portal_extra_fields.
export type ExtraField = { key: string; label: string; type: 'number' | 'textarea'; hint?: string };
export const PORTAL_FIELDS: Record<Portal, ExtraField[]> = {
  jobstreet: [
    { key: 'expected_salary', label: 'Gaji bulanan yang diharapkan (Rp)', type: 'number', hint: 'Kosongkan untuk memakai gaji minimum di Profil.' },
    { key: 'cover_letter', label: 'Surat lamaran', type: 'textarea', hint: 'Opsional. Dipakai bila formulir menyediakan surat lamaran; kosongkan untuk tidak menyertakan.' },
  ],
  glints: [
    { key: 'expected_salary', label: 'Gaji bulanan yang diharapkan (Rp)', type: 'number', hint: 'Kosongkan untuk memakai gaji minimum di Profil.' },
  ],
  linkedin: [],
};

export const STATUS_LABEL: Record<string, string> = {
  queued: 'Dalam antrean',
  in_progress: 'Diproses',
  submitted: 'Terkirim',
  failed: 'Gagal',
  needs_action: 'Perlu tindakan',
  skipped: 'Dilewati',
  cancelled: 'Dibatalkan',
};

// A dry run never submits, so a successful one is stored as "skipped" with this reason (shown as "Uji coba berhasil").
export const DRY_RUN_OK = 'Uji coba selesai: formulir terisi, tidak dikirim';

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  scraping: 'Mencari lowongan',
  ready: 'Siap ditinjau',
  running: 'Berjalan',
  paused: 'Dijeda',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};
