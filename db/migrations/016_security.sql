-- Fixes from the 2026-10-02 security audit.

-- One pending purchase per user and pack: parallel "Beli" clicks can't hold several unique amounts.
update topups t set status = 'expired' where status = 'pending' and exists (
  select 1 from topups n where n.user_id = t.user_id and n.tokens = t.tokens and n.price = t.price
    and n.status = 'pending' and (n.created_at, n.id) > (t.created_at, t.id));
create unique index topups_one_pending_per_pack on topups (user_id, tokens, price) where status = 'pending';

-- The search queue goes by when a search was (re)started, not by when it was created, so re-running an old search
-- doesn't jump ahead of everyone else.
alter table campaigns add column scrape_requested_at timestamptz not null default now();

-- Free searches once per email address, given when the address is proven (grantFreeSearches). The address is kept as
-- a hash of its normal form (case, "+tag" and Gmail dots ignored), also after the account is deleted, so aliases and
-- re-registrations don't get them again. Accounts that exist now got theirs at sign-up already.
create table free_grants (
  email_hash text primary key,
  user_id uuid,
  granted_at timestamptz not null default now()
);
insert into free_grants (email_hash, user_id)
select encode(sha256(convert_to(
    case when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
      else split_part(split_part(e, '@', 1), '+', 1) || '@' || split_part(e, '@', 2) end, 'UTF8')), 'hex'), id
from (select id, lower(trim(email)) as e from users order by created_at) u
on conflict do nothing;
alter table users alter column tokens set default 0;
