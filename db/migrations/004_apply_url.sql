-- Company-site apply link for "external" listings, when the portal exposes it publicly (Glints does; JobStreet and
-- LinkedIn only after sign-in, so those fall back to the listing page and its "apply on company site" button).
alter table job_listings add column apply_url text;
