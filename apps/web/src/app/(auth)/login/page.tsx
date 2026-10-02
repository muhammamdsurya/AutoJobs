import Link from 'next/link';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { GoogleMark, googleBtn, OrDivider } from '@/components/google-button';
import { Field, Notice } from '@autojobs/shared/ui';
import { googleEnabled } from '@/lib/google';
import { login } from '../actions';
import { SUSPENDED } from '../suspended';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke akun AutoJobs untuk mencari loker dan memantau lamaran otomatis Anda di JobStreet, Glints, dan LinkedIn.',
  alternates: { canonical: '/login' },
};

const ERRORS: Record<string, string> = {
  google: 'Masuk dengan Google gagal. Coba lagi.',
  google_state: 'Sesi masuk Google kedaluwarsa atau dibuka di tab lain. Coba lagi.',
  google_off: 'Masuk dengan Google belum diaktifkan di server ini.',
  suspended: SUSPENDED,
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Masuk</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Selamat datang kembali. Lanjutkan pencarian kerja Anda.</p>
      {error && ERRORS[error] && <div className="mb-4"><Notice tone="red">{ERRORS[error]}</Notice></div>}
      {googleEnabled() && (
        <>
          <a href="/api/auth/google?mode=login" className={googleBtn}><GoogleMark />Masuk dengan Google</a>
          <OrDivider label="atau dengan email" />
        </>
      )}
      <ActionForm action={login} className="space-y-4">
        <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Kata sandi"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
        <Submit className="btn btn-primary w-full">Masuk</Submit>
      </ActionForm>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/signup">Buat akun</Link>
        <Link href="/forgot-password">Lupa kata sandi?</Link>
      </div>
    </>
  );
}
