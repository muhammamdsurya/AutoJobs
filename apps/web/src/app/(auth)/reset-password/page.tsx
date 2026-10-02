import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { CodeInput } from '@/components/google-button';
import { Field } from '@autojobs/shared/ui';
import { CODE_MINUTES } from '@autojobs/shared/auth';
import { resendResetCode, resetPassword } from '../actions';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Atur ulang kata sandi', robots: { index: false } };

// b***i@gmail.com: enough to recognise, without showing the whole address.
const mask = (email: string) => email.replace(/^(.)(.*)(.)@/, (_, a, mid, z) => `${a}${'*'.repeat(Math.min(mid.length, 6))}${z}@`);

export default async function ResetPasswordPage() {
  const email = (await cookies()).get('reset_email')?.value;
  if (!email) redirect('/forgot-password');
  return (
    <>
      <h1>Kata sandi baru</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Jika <b>{mask(email)}</b> terdaftar, kode 6 digit sudah dikirim ke sana (berlaku {CODE_MINUTES} menit, cek juga folder spam).
      </p>
      <ActionForm action={resetPassword} className="space-y-4">
        <CodeInput />
        <Field label="Kata sandi baru" hint="Minimal 8 karakter.">
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Submit className="btn btn-primary w-full">Simpan kata sandi</Submit>
      </ActionForm>
      <div className="mt-4 flex items-center justify-between text-sm">
        <ActionForm action={resendResetCode}><Submit className="cursor-pointer font-semibold text-accent hover:underline">Kirim ulang kode</Submit></ActionForm>
        <Link href="/forgot-password">Ganti email</Link>
      </div>
    </>
  );
}
