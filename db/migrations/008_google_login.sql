-- Sign in with Google: the Google account id, and accounts created with Google have no password (until they set one
-- through "Lupa kata sandi").
alter table users add column google_sub text;
create unique index users_google_sub on users (google_sub) where google_sub is not null;
alter table users alter column password_hash drop not null;
