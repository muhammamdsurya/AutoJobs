-- Tokens: 1 token = 1 Cari Loker (re-running a search before launch is free; admins don't use tokens). Every account
-- starts with 3 (FREE_SEARCHES in src/lib/tokens.ts; existing accounts get them too). Top-ups are manual: the user pays
-- a pack by QRIS and uploads the transfer proof; an admin approves it (tokens added) or rejects it with a note.
alter table users add column tokens integer not null default 3 check (tokens >= 0);

create table topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  tokens integer not null,
  amount integer not null, -- rupiah, the pack price at request time
  proof_key text not null, -- encrypted file (src/lib/crypto saveFile)
  proof_mime text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text, -- admin's reason when rejected
  created_at timestamptz not null default now()
);
create index topups_user on topups (user_id, created_at desc);
