-- Several committee members in one flat (28 Oct 2026): e.g. the father is Committee Member and the son Co-opted Member.
-- flats.committee_members = list of {name, role}, one per person on the committee (set from FAMILY MEMBERS → Edit).
-- flats.is_committee / committee_role stay (role = the highest designation in the list), so logins, booking approval
-- and committee areas keep working. An empty list = the owner (or committee_person) with the flat's designation, as before.
-- Run once in Supabase > SQL Editor AFTER COMMITTEE_PERSON.sql. Safe to re-run. Flat logins cannot change the list
-- (the flat rules of sql-security/05 lock new columns).

alter table public.flats add column if not exists committee_members jsonb not null default '[]'::jsonb;

-- the person already chosen with COMMITTEE_PERSON.sql becomes the first entry
-- (the flat rules of sql-security/05 are paused for this one update only: the SQL Editor has no committee login)
alter table public.flats disable trigger flats_resident_guard;
update public.flats set committee_members = jsonb_build_array(jsonb_build_object('name', trim(committee_person), 'role', coalesce(nullif(trim(committee_role), ''), 'Committee Member')))
 where is_committee and nullif(trim(coalesce(committee_person, '')), '') is not null and committee_members = '[]'::jsonb;
alter table public.flats enable trigger flats_resident_guard;

-- names + designations of everyone on the committee, for every login (as in the committee directory)
drop function if exists public.committee_people();
create function public.committee_people()
returns table (flat_id text, committee_role text, person text, people jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.committee_role,
         coalesce(nullif(trim(f.committee_person), ''), f.owner_name),
         case when jsonb_array_length(f.committee_members) > 0 then f.committee_members
              else jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(f.committee_person), ''), f.owner_name), 'role', coalesce(nullif(trim(f.committee_role), ''), 'Committee Member'))) end
    from public.flats f where f.is_committee
$$;
revoke all on function public.committee_people() from public, anon;
grant execute on function public.committee_people() to authenticated;

-- Check: column 1, function 1, flat rules on true
select 'column' as item, count(*)::text as value from information_schema.columns where table_schema = 'public' and table_name = 'flats' and column_name = 'committee_members'
union all select 'function', count(*)::text from pg_proc where proname = 'committee_people'
union all select 'flat rules on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'flats_resident_guard' and not tgisinternal)::text;
