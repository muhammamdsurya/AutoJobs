-- Which paired browser (extension token hash) is working on an in-progress application, so a restarted extension can
-- hand back what it was doing at once instead of blocking the queue until the 15-minute lease runs out.
alter table applications add column leased_by text;
