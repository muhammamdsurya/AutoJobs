// Applies db/migrations/*.sql in order, once each.
import { readdirSync, readFileSync } from 'node:fs';
import { sql } from '@autojobs/shared/db';

await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
for (const file of readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(`db/migrations/${file}`, 'utf8'));
    await tx`insert into schema_migrations (name) values (${file})`;
  });
  console.log(`applied ${file}`);
}
await sql.end();
