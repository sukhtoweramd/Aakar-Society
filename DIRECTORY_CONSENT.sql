-- Aakar Sukh Tower - member directory with consent
-- Safe to run more than once. Deletes no data. Run in Supabase > SQL Editor.

-- 1. Consent is recorded per flat (one tick for the whole family)
alter table public.flats add column if not exists directory_consent    boolean not null default false;
alter table public.flats add column if not exists directory_consent_at timestamptz;
alter table public.flats add column if not exists directory_consent_by text;

-- 2. Directory everyone can read:
--    every flat shows flat number + owner name (as on the board near the lift);
--    only flats that gave consent also show family members' names, relation and mobile.
create or replace view public.member_directory with (security_invoker = false) as
  select f.id as flat_id, f.tower, f.floor, f.owner_name, f.is_committee, f.directory_consent as consent,
         m.id as member_id, m.name as member_name, m.relation, m.mobile, coalesce(m.is_head, false) as is_head
  from public.flats f
  left join public.members m on m.flat_id = f.id and f.directory_consent = true;
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;

-- 3. Check: number of flats that have given consent
select count(*) filter (where directory_consent) as flats_consented, count(*) as flats_total from public.flats;
