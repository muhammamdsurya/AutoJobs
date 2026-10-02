import postgres from 'postgres';

const g = globalThis as unknown as { sql?: postgres.Sql };

// One pool per process; globalThis keeps it across Next.js dev hot reloads.
// Columns come back camelCased (full_name -> fullName); SQL text stays snake_case.
export const sql = (g.sql ??= postgres(process.env.DATABASE_URL ?? '', {
  transform: { ...postgres.camel, undefined: null },
  max: Number(process.env.DB_POOL_MAX ?? 10),
  onnotice: () => {},
}));

// `actorId`: the admin who did it to `userId`'s account (null: the user themself, or the system). `db`: a transaction.
export async function audit(userId: string | null, action: string, detail?: Record<string, unknown>, actorId: string | null = null, db: postgres.Sql | postgres.TransactionSql = sql) {
  await db`insert into audit_log (user_id, action, detail, actor_id) values (${userId}, ${action}, ${detail ? sql.json(detail as postgres.JSONValue) : null}, ${actorId})`;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
