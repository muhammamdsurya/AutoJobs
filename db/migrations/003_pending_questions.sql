-- Questions that stopped an application ("Perlu tindakan"), with the options the portal offered, so the user can
-- answer them in AutoJobs; the answer is saved to the answer bank and every application it unblocks is re-queued.
alter table applications add column pending_questions jsonb;
