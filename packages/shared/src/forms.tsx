'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

export type FormState = { error?: string; ok?: string };
type Action = (state: FormState, fd: FormData) => Promise<FormState>;

const Pending = createContext<boolean | null>(null);

// Form bound to a Server Action that returns { error | ok } shown under the fields.
// `action` gives the server-rendered form method=POST + the action id, so it still works (and never leaks fields
// into the URL via GET) before JavaScript runs. Once hydrated, onSubmit takes over: React 19 would otherwise reset
// the form after the action, blanking selects after saving and wiping input when validation fails.
export function ActionForm({ action, children, className, resetOnOk }: { action: Action; children: React.ReactNode; className?: string; resetOnOk?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnOk && state.ok) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <Pending.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        {state.error && <p className="mt-3 flex gap-2 rounded-control border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100" role="alert">{state.error}</p>}
        {state.ok && <p className="mt-3 rounded-control border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-teal-100" role="status">{state.ok}</p>}
      </form>
    </Pending.Provider>
  );
}

export function Submit({ children, className = 'btn btn-primary', confirm }: { children: React.ReactNode; className?: string; confirm?: string }) {
  const inActionForm = useContext(Pending);
  const { pending: plainFormPending } = useFormStatus();
  const pending = inActionForm ?? plainFormPending;
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? 'Memproses…' : children}
    </button>
  );
}

// Re-renders the page every few seconds while background work runs (scraping, queue progress).
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

// Live "berikutnya dalam 1:23" until `to`; the page's AutoRefresh picks up what happens after.
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((new Date(to).getTime() - now) / 1000));
  if (!s) return <>segera diproses</>;
  const mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  return <span suppressHydrationWarning>berikutnya dalam <b className="num">{mm}:{ss}</b></span>;
}
