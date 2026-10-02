import { MailCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { CodeInput } from '@/components/google-button';
import { CODE_MINUTES, currentUser } from '@autojobs/shared/auth';
import { logout, resendVerification, verifyEmailCode } from '../actions';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Verifikasi email', robots: { index: false } };

export default async function VerifyEmailPage() {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (u.emailVerifiedAt) redirect('/campaigns');
  return (
    <>
      <span className="grid size-12 place-items-center rounded-card bg-accent/10 text-accent ring-1 ring-inset ring-accent/25"><MailCheck className="size-6" aria-hidden /></span>
      <h1 className="mt-4">Cek email Anda</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Masukkan kode 6 digit yang kami kirim ke <b>{u.email}</b>. Berlaku {CODE_MINUTES} menit. Tidak ada di kotak masuk? Cek folder spam.
      </p>
      <ActionForm action={verifyEmailCode} className="space-y-4">
        <CodeInput />
        <Submit className="btn btn-primary w-full">Verifikasi</Submit>
      </ActionForm>
      <div className="mt-4 flex items-center justify-between text-sm">
        <ActionForm action={resendVerification}><Submit className="cursor-pointer font-semibold text-accent hover:underline">Kirim ulang kode</Submit></ActionForm>
        <form action={logout}><button className="cursor-pointer text-muted hover:text-ink hover:underline">Keluar</button></form>
      </div>
    </>
  );
}
