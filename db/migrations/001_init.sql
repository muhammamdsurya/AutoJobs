-- Core schema for the job auto-apply system (PRD section 6), plus auth/ops tables a public SaaS needs.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  email_verified_at timestamptz,
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

create table email_tokens (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  expires_at timestamptz not null
);

create table candidate_profiles (
  user_id uuid primary key references users on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone_country text not null default '+62',
  phone text not null default '',
  street text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  dob date,
  linkedin_url text not null default '',
  portfolio_url text not null default '',
  current_title text not null default '',
  years_experience real,
  education_level text not null default '',
  education_institution text not null default '',
  education_major text not null default '',
  skills text[] not null default '{}',
  expected_salary_min integer,
  expected_salary_max integer,
  notice_period text not null default '',
  willing_to_relocate boolean not null default false,
  work_pref text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table cv_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  file_key text not null,
  file_name text not null,
  mime text not null,
  size_bytes integer not null,
  is_default boolean not null default false,
  uploaded_at timestamptz not null default now()
);
create unique index cv_one_default on cv_documents (user_id) where is_default;

create table portal_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  portal text not null check (portal in ('linkedin', 'jobstreet', 'glints')),
  session_blob_encrypted bytea,
  user_agent text,
  proxy_encrypted bytea,
  status text not null default 'expired' check (status in ('connected', 'expired', 'needs_verification')),
  last_verified_at timestamptz,
  -- Gap rule (SQ-02, per portal account): nothing is claimed for this account before this time.
  next_apply_at timestamptz,
  unique (user_id, portal)
);

create table portal_extra_fields (
  user_id uuid not null references users on delete cascade,
  portal text not null,
  field_key text not null,
  value text not null,
  primary key (user_id, portal, field_key)
);

create table answer_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  question_pattern text not null,
  answer text not null,
  portal text,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  name text not null,
  portals text[] not null,
  position_include text[] not null,
  position_exclude text[] not null default '{}',
  desc_include text[] not null default '{}',
  desc_mode text not null default 'or' check (desc_mode in ('and', 'or')),
  desc_exclude text[] not null default '{}',
  experience_levels text[] not null default '{}',
  company_exclude text[] not null default '{}',
  location text not null default 'Indonesia',
  max_pages integer not null default 3,
  max_listings integer not null default 50,
  dry_run boolean not null default false,
  status text not null default 'scraping'
    check (status in ('scraping', 'ready', 'running', 'paused', 'completed', 'cancelled')),
  locked_until timestamptz,
  scrape_summary jsonb,
  launched_at timestamptz,
  created_at timestamptz not null default now()
);
create index campaigns_user on campaigns (user_id, created_at desc);

create table job_listings (
  id uuid primary key default gen_random_uuid(),
  portal text not null,
  external_id text not null,
  url text not null,
  title text not null,
  company text not null default '',
  location text not null default '',
  work_arrangement text not null default '',
  job_type text not null default '',
  experience_min real,
  experience_max real,
  seniority_label text not null default '',
  salary_text text not null default '',
  description text not null default '',
  skills text[] not null default '{}',
  -- Screening questions the portal shows before applying (JobStreet lists them on the job page).
  questions text[] not null default '{}',
  posted_at timestamptz,
  apply_method text not null default 'unknown'
    check (apply_method in ('easy_apply', 'portal_apply', 'external', 'unknown')),
  closed boolean not null default false,
  raw_json jsonb,
  detail_scraped_at timestamptz,
  scraped_at timestamptz not null default now(),
  unique (portal, external_id)
);

create table campaign_matches (
  campaign_id uuid not null references campaigns on delete cascade,
  listing_id uuid not null references job_listings on delete cascade,
  match_reason text not null,
  experience_levels text[] not null default '{}',
  flags text[] not null default '{}',
  selected boolean not null default true,
  primary key (campaign_id, listing_id)
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  campaign_id uuid not null references campaigns on delete cascade,
  listing_id uuid not null references job_listings,
  portal text not null,
  cv_id uuid references cv_documents on delete set null,
  dry_run boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'submitted', 'failed', 'needs_action', 'skipped', 'cancelled')),
  attempt_count integer not null default 0,
  scheduled_at timestamptz not null default now(),
  locked_until timestamptz,
  submitted_at timestamptz,
  failure_reason text,
  screenshot_key text,
  answers jsonb,
  confirmation_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Idempotency (NFR): one real application per user + listing (listing = portal + external id). Dry runs don't count.
create unique index applications_once on applications (user_id, listing_id) where not dry_run;
create index applications_queue on applications (scheduled_at) where status = 'queued';
create index applications_user on applications (user_id, created_at desc);
create index applications_campaign on applications (campaign_id, status);

create table application_events (
  id bigserial primary key,
  application_id uuid not null references applications on delete cascade,
  event text not null,
  detail text,
  file_key text,
  created_at timestamptz not null default now()
);
create index application_events_app on application_events (application_id, id);

create table scrape_runs (
  id bigserial primary key,
  campaign_id uuid references campaigns on delete set null,
  portal text not null,
  ok boolean not null,
  listings integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index scrape_runs_recent on scrape_runs (created_at desc);

create table settings (
  key text primary key,
  value jsonb not null
);

create table audit_log (
  id bigserial primary key,
  user_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
