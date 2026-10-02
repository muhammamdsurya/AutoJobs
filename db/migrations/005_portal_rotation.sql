-- Applications rotate between portals (JobStreet → LinkedIn → Glints → …): the least recently used portal goes next.
alter table portal_accounts add column last_attempt_at timestamptz;
