-- Applying moved into the user's own browser (AutoJobs Chrome extension). The server no longer keeps portal
-- sessions or proxies: portal_accounts now only tracks per-portal status (reported by the extension) and the gap.
alter table portal_accounts
  drop column session_blob_encrypted,
  drop column user_agent,
  drop column proxy_encrypted;

create table extension_tokens (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index extension_tokens_user on extension_tokens (user_id);

create table pairing_codes (
  code_hash text primary key,
  user_id uuid not null references users on delete cascade,
  expires_at timestamptz not null
);

-- Pages the worker asks the user's browser to load (Glints only answers a real browser the user verified).
create table browser_fetches (
  id bigserial primary key,
  user_id uuid not null references users on delete cascade,
  url text not null,
  status text not null default 'pending' check (status in ('pending', 'taken', 'done', 'failed')),
  body text,
  error text,
  created_at timestamptz not null default now()
);
create index browser_fetches_pending on browser_fetches (user_id, id) where status = 'pending';
