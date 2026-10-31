-- DOB.sql · Date of birth instead of age for family members (Aakar, decided 31 Oct 2026)
--   • members.dob (optional). The app works the age out; old typed ages stay until a date of birth is entered.
--   • Entering a date of birth means the family agrees to share the BIRTHDAY with all members: the member directory
--     shows day and month only (birth_day, birth_month), never the year. The full date is read only by that flat and the
--     committee (the existing rules on the members table).
--   • No new table. Backups and restores carry the new column automatically.
-- Run in Supabase > SQL Editor. Safe to re-run. Undo: DOB_UNDO.sql.

alter table public.members add column if not exists dob date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_dob_check') then
    alter table public.members add constraint members_dob_check check (dob is null or (dob >= date '1900-01-01' and dob <= current_date));
  end if;
end $$;

-- Member directory (as in COMMITTEE_ROLES.sql) plus birth_day / birth_month, only for flats that share their family details
create or replace view public.member_directory with (security_invoker = false) as
  select f.id as flat_id, f.tower, f.floor, f.owner_name, f.is_committee, f.directory_consent as consent,
         m.id as member_id, m.name as member_name, m.relation, m.mobile, coalesce(m.is_head, false) as is_head,
         f.occupancy, f.tenant_name, f.committee_role,
         extract(day from m.dob)::int as birth_day, extract(month from m.dob)::int as birth_month
  from public.flats f
  left join public.members m on m.flat_id = f.id and f.directory_consent = true;
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated, service_role;

-- Check: column 1, view columns 2, the view never carries the year, how many dates of birth are entered
select 'dob column' as item, count(*)::text as value from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'dob'
union all select 'directory birthday columns (expect 2)', count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'member_directory' and column_name in ('birth_day', 'birth_month')
union all select 'directory has no full date (expect 0)', count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'member_directory' and column_name in ('dob', 'birth_year', 'birth_date')
union all select 'dates of birth entered', count(*)::text from public.members where dob is not null;
