'use server';

import { requireUser } from '@autojobs/shared/auth';
import { sql } from '@autojobs/shared/db';

// The first-login tutorial was closed (finished or skipped): don't open it by itself again.
export async function markTutorialSeen() {
  const user = await requireUser();
  await sql`update users set tutorial_seen_at = now() where id = ${user.id} and tutorial_seen_at is null`;
}
