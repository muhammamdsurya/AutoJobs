// Instant hand-off between processes (web ↔ worker) with PostgreSQL LISTEN/NOTIFY instead of polling. One LISTEN
// connection per process; callers wait on a key such as `fetch-done:<id>`. Notifications can be missed (listener
// reconnecting), so every wait has a timeout and callers re-check the database.
import { sql } from '@autojobs/shared/db';

const CHANNEL = 'autojobs';
const g = globalThis as unknown as { notifyWaiters?: Map<string, Set<() => void>>; notifyListening?: Promise<unknown> };
const waiters = (g.notifyWaiters ??= new Map());

// Resolves once this process is listening.
export const listening = () =>
  (g.notifyListening ??= sql.listen(CHANNEL, (key) => {
    for (const wake of waiters.get(key) ?? []) wake();
  }));

// Call after `await listening()`: registers right away (so a notification sent while the caller checks the database
// isn't lost), resolves true when notified, false on timeout.
export function waitFor(key: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const set = waiters.get(key) ?? new Set();
    waiters.set(key, set);
    const done = (notified: boolean) => {
      clearTimeout(timer);
      set.delete(wake);
      if (!set.size) waiters.delete(key);
      resolve(notified);
    };
    const wake = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    set.add(wake);
  });
}

export const notify = (key: string) => sql`select pg_notify(${CHANNEL}, ${key})`;
