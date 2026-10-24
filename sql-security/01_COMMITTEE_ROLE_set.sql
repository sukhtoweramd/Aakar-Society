-- 01 · Give every real committee login an explicit role 'committee'   (Aakar security fixes, Oct 2026)
-- Run this FIRST, before the app update and before 02. It changes only the login's "app_metadata" (role),
-- never passwords, flats or society data. A copy of the old values is kept for 01_UNDO.
-- The live check of 24 Oct 2026 found exactly ONE login with no role (the society's own committee account);
-- the other committee login already has role 'committee'. Flat logins (role 'resident') are never touched.
-- Safety: stops without changing anything if it finds a different number of role-less logins than expected,
-- so a login created since the check is never promoted by accident. (No emails are written here: this repo is public.)

do $$ declare n int; begin
  select count(*) into n from auth.users
   where coalesce(raw_app_meta_data ->> 'role', '') = '' and email not like '%@flats.aakarsociety.app';
  if n <> 1 then
    raise exception 'Stopped: expected 1 login without a role, found %. Send the result of 00_LIVE_CHECK again before going on.', n;
  end if;
end $$;

-- 1. keep a private copy of the current values (only the database owner can read this table)
create table if not exists public.zz_security_app_meta_backup (
  user_id uuid primary key, email text, raw_app_meta_data jsonb, saved_at timestamptz not null default now()
);
alter table public.zz_security_app_meta_backup enable row level security;
revoke all on public.zz_security_app_meta_backup from anon, authenticated;
insert into public.zz_security_app_meta_backup (user_id, email, raw_app_meta_data)
select id, email, raw_app_meta_data from auth.users
 where coalesce(raw_app_meta_data ->> 'role', '') = '' and email not like '%@flats.aakarsociety.app'
on conflict (user_id) do nothing;

-- 2. set role = committee on that login (other keys are kept)
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "committee"}'::jsonb
 where coalesce(raw_app_meta_data ->> 'role', '') = '' and email not like '%@flats.aakarsociety.app';

-- Check: every non-flat login should now show role = committee (expect 2 rows, both committee)
select email, coalesce(raw_app_meta_data ->> 'role', 'NONE') as role, coalesce(raw_app_meta_data ->> 'flat_id', '-') as flat
from auth.users where coalesce(raw_app_meta_data ->> 'role', '') <> 'resident' order by email;
