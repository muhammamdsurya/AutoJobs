import { ShieldCheck } from 'lucide-react';
import { ActionForm, Submit } from '@autojobs/shared/forms';
import { Field, Logo } from '@autojobs/shared/ui';
import { login } from './actions';

export default function LoginPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3"><Logo href="/login" /><span className="text-sm text-muted">Admin</span></div>
        <div className="panel route-enter">
          <h1 className="text-2xl sm:text-3xl">Konsol admin</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Masuk dengan akun AutoJobs yang berperan admin.</p>
          <ActionForm action={login} className="space-y-4">
            <Field label="Email"><input className="input" name="email" type="email" autoComplete="username" required /></Field>
            <Field label="Kata sandi"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
            <Submit className="btn btn-primary w-full">Masuk</Submit>
          </ActionForm>
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
          <ShieldCheck className="size-4 text-accent" aria-hidden />Sesi konsol berakhir setelah 12 jam.
        </p>
      </div>
    </main>
  );
}
