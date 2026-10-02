-- One-time codes (OTP) by email for verifying a new account and for resetting a forgotten password. One active code
-- per user and purpose; only its hash is stored; a few wrong tries void it.
create table email_codes (
  user_id uuid not null references users on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_at timestamptz not null default now(),
  primary key (user_id, purpose)
);
