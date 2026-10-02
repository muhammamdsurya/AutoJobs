-- Admin console (apps/admin) and automatic token payments.

-- Console sessions are kept apart from the app's (own cookie, shorter life). A suspended user can't sign in and their
-- extension pauses.
alter table sessions add column scope text not null default 'web' check (scope in ('web', 'admin'));
alter table users add column suspended_at timestamptz;

-- Who did it when an admin acts on someone's account (null: the user themself, or the system).
alter table audit_log add column actor_id uuid;
create index audit_log_recent on audit_log (created_at desc);
create index audit_log_user on audit_log (user_id, created_at desc);

-- Token packs, edited in the admin console (seeded with the launch prices). Never deleted, only hidden: a purchase
-- keeps its own copy of tokens and price.
create table token_packs (
  id serial primary key,
  tokens integer not null check (tokens between 1 and 1000),
  price integer not null check (price between 1000 and 10000000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into token_packs (tokens, price) values (1, 5000), (10, 30000), (20, 50000);

-- Purchases. Each pays a unique amount (pack price minus a code), payable by QR for 15 minutes (expires_at); the
-- worker polls the DANA Business transaction list and credits the pending purchase with that amount. A purchase stays
-- pending (its amount reserved) for 24 h, so a late payment still finds it. Backup: the user uploads a transfer proof
-- and an admin approves it.
alter table topups
  add column price integer, -- the pack's list price; amount = what the user pays
  add column expires_at timestamptz,
  add column paid_at timestamptz,
  add column method text check (method in ('dana', 'proof', 'admin')),
  add column dana_trx_id text unique,
  add column decided_by uuid references users on delete set null,
  alter column proof_key drop not null,
  alter column proof_mime drop not null,
  drop constraint topups_status_check;
update topups set price = amount, expires_at = created_at,
  method = case when status = 'approved' then 'proof' end,
  paid_at = case when status = 'approved' then created_at end,
  status = case when status = 'approved' then 'paid' else status end;
alter table topups
  alter column price set not null,
  alter column expires_at set not null,
  add constraint topups_status_check check (status in ('pending', 'paid', 'rejected', 'expired'));
-- One pending purchase per amount: an incoming payment can only ever match one.
create unique index topups_pending_amount on topups (amount) where status = 'pending';
create index topups_paid on topups (paid_at) where status = 'paid';

-- Every DANA transaction the poller has seen, once (its id): matched to a purchase, or left for an admin to assign.
create table dana_transactions (
  trx_id text primary key,
  amount integer not null,
  paid_at timestamptz not null,
  topup_id uuid references topups on delete set null,
  status text not null default 'unmatched' check (status in ('matched', 'unmatched', 'ignored')),
  raw jsonb,
  seen_at timestamptz not null default now()
);
create index dana_transactions_unmatched on dana_transactions (seen_at desc) where status = 'unmatched';
