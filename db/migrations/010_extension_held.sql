-- The extension holds the queue after Chrome starts until the user says go (notification or popup); the campaign page
-- shows it.
alter table extension_tokens add column held boolean not null default false;
