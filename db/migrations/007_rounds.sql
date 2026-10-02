-- Rounds: one application per portal back to back (JobStreet → LinkedIn → Glints), then one gap. round_started_at marks
-- when the current round began (set on all the user's accounts when a gap is scheduled); a portal whose last attempt
-- is after it has had its turn this round.
alter table portal_accounts add column round_started_at timestamptz;
