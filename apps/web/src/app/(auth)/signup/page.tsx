import Link from 'next/link';
import { cookies } from 'next/headers';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { GoogleMark, googleBtn, OrDivider } from '@/components/google-button';
import { Field, Notice } from '@autojobs/shared/ui';
import { googleEnabled } from '@/lib/google';
import { signup } from '../actions';
import type { Metadata } from 'next';
import { FREE_SEARCHES } from '@autojobs/shared/tokens';

export const metadata: Metadata = {
  title: 'Daftar gratis',
  description: `Buat akun AutoJobs gratis dan dapatkan ${FREE_SEARCHES}x Cari Loker untuk melamar kerja otomatis di JobStreet, Glints, dan LinkedIn.`,
  alternates: { canonical: '/signup' },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const unregistered = error === 'google_new' ? (await cookies()).get('g_unregistered')?.value : undefined;
  return (
    <>
      <h1>Buat akun</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Satu profil untuk melamar di JobStreet, Glints, dan LinkedIn.</p>
      {error === 'google_new' && (
        <div className="mb-5">
          <Notice>
            Akun Google {unregistered ? <b>{unregistered}</b> : 'itu'} belum terdaftar di AutoJobs. Buat akunnya sekarang: centang kedua
            persetujuan di bawah, lalu klik <b>Daftar dengan Google</b>.
          </Notice>
        </div>
      )}
      {error === 'consent' && <div className="mb-5"><Notice tone="blue">Centang kedua persetujuan di bawah dulu, lalu daftar dengan Google.</Notice></div>}
      <ActionForm action={signup} className="space-y-4">
        <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Kata sandi" hint="Minimal 8 karakter.">
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {/* The consents sit right above both ways of creating the account. */}
        <div className="space-y-3 rounded-card border border-white/8 bg-white/4 p-4">
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="consent" className="mt-0.5 size-5 shrink-0 accent-accent" required />
            <span>
              Saya menyetujui <Link href="/legal" target="_blank">Ketentuan Layanan</Link> dan pemrosesan data pribadi saya (CV, kontak, alamat)
              sesuai <Link href="/legal#privasi" target="_blank">Kebijakan Privasi</Link> dan UU PDP No. 27/2022.
            </span>
          </label>
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="risk" className="mt-0.5 size-5 shrink-0 accent-accent" required />
            <span>
              Saya memahami bahwa JobStreet, Glints, dan LinkedIn membatasi otomatisasi dalam ketentuan mereka, sehingga akun portal saya
              bisa dibatasi. Semua pencarian saya luncurkan sendiri.
            </span>
          </label>
        </div>
        <Submit className="btn btn-primary w-full">Buat akun</Submit>
        {googleEnabled() && (
          <>
            <OrDivider />
            {/* formNoValidate: email and password aren't needed for Google; the consents are checked on the server. */}
            <button type="submit" name="method" value="google" formNoValidate className={googleBtn}><GoogleMark />Daftar dengan Google</button>
          </>
        )}
      </ActionForm>
      <p className="mt-4 text-sm">Sudah punya akun? <Link href="/login">Masuk</Link></p>
    </>
  );
}
