-- Short tutorial pop-up on first sign-in: once per account, new accounts only (existing ones count as having seen it).
alter table users add column tutorial_seen_at timestamptz;
update users set tutorial_seen_at = now();
