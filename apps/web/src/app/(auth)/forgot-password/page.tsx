import Link from 'next/link';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { Field } from '@autojobs/shared/ui';
import { forgotPassword } from '../actions';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Lupa kata sandi', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1>Lupa kata sandi</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Kami kirim kode 6 digit ke email Anda untuk membuat kata sandi baru.</p>
      <ActionForm action={forgotPassword} className="space-y-4">
        <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
        <Submit className="btn btn-primary w-full">Kirim kode</Submit>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/login">Kembali ke halaman masuk</Link></p>
    </>
  );
}
