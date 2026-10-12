-- Aakar Sukh Tower - resident (flat) logins
-- Safe to run more than once. Deletes no data.
-- Run in Supabase > SQL Editor AFTER SUPABASE_SETUP.sql.
--
-- Who is who:
--   * Committee  = any login WITHOUT app_metadata.role = 'resident' (e.g. sukhtoweramd@gmail.com)
--   * Resident   = login created from the ADMIN tab: app_metadata.role = 'resident', app_metadata.flat_id = 'A101'
-- app_metadata can only be set by the server (secret key), never by the user, so residents cannot promote themselves.

-- 0. Profession / business details live on each family member
alter table public.members add column if not exists occupation       text;  -- e.g. Doctor, Chartered Accountant, Service
alter table public.members add column if not exists business_name    text;  -- company / firm / employer
alter table public.members add column if not exists business_category text; -- e.g. Medical, Legal, IT, Retail
alter table public.members add column if not exists office_address   text;
alter table public.members add column if not exists office_phone     text;
alter table public.members add column if not exists email            text;

-- Multi-day events (Ganpati, Navratri…): optional last day
alter table public.events add column if not exists end_date date;

-- 1. Helper functions
create or replace function public.is_committee() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'committee') <> 'resident'
$$;

create or replace function public.my_flat() returns text
language sql stable as $$
  select auth.jwt() -> 'app_metadata' ->> 'flat_id'
$$;

-- 2. Replace the simple "any logged-in user" rules with committee / resident rules
do $$
declare t text; p record;
begin
  foreach t in array array['flats','notices','members','maintenance','events','businesses'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      -- committee keeps full access everywhere
      execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
    end if;
  end loop;
end $$;

-- flats: residents see and edit ONLY their own flat
create policy resident_read_own_flat   on public.flats for select to authenticated using (id = public.my_flat());
create policy resident_update_own_flat on public.flats for update to authenticated using (id = public.my_flat()) with check (id = public.my_flat());

-- members (family): residents manage their own flat's members
create policy resident_members_own on public.members for all to authenticated using (flat_id = public.my_flat()) with check (flat_id = public.my_flat());

-- maintenance ledger: residents can read their own flat's entries
create policy resident_maintenance_read on public.maintenance for select to authenticated using (flat_id = public.my_flat());

-- notices and events: everyone logged in can read
create policy resident_notices_read on public.notices for select to authenticated using (true);
create policy resident_events_read  on public.events  for select to authenticated using (true);

-- businesses: everyone can read; residents add/edit/remove only their own flat's listings
create policy resident_business_read on public.businesses for select to authenticated using (true);
create policy resident_business_own  on public.businesses for all to authenticated using (flat_id = public.my_flat()) with check (flat_id = public.my_flat());

-- 3. Residents may only change personal fields of their flat (not charges, status, committee flag, etc.)
create or replace function public.flats_resident_guard() returns trigger
language plpgsql as $$
begin
  if public.is_committee() then return new; end if;
  if new.id is distinct from old.id or new.tower is distinct from old.tower or new.floor is distinct from old.floor
     or new.flat_no is distinct from old.flat_no or new.bhk is distinct from old.bhk
     or new.maintenance is distinct from old.maintenance or new.sqft is distinct from old.sqft
     or new.status is distinct from old.status or new.is_committee is distinct from old.is_committee
     or new.edit_code is distinct from old.edit_code then
    raise exception 'Residents can only change owner name, email and documents. Ask the committee for other changes.';
  end if;
  return new;
end $$;

drop trigger if exists flats_resident_guard on public.flats;
create trigger flats_resident_guard before update on public.flats for each row execute function public.flats_resident_guard();

-- 4. Society directory for residents: flat number, owner name and committee flag only (no emails)
create or replace view public.flat_directory with (security_invoker = false) as
  select id, tower, floor, flat_no, owner_name, is_committee, status from public.flats;
revoke all on public.flat_directory from anon, public;
grant select on public.flat_directory to authenticated;

-- 5. Business directory for everyone: built from family members' profession details
create or replace view public.business_directory with (security_invoker = false) as
  select m.id, m.flat_id, m.name, m.occupation, m.business_name, m.business_category, m.office_address, m.office_phone, f.tower
  from public.members m left join public.flats f on f.id = m.flat_id
  where coalesce(m.occupation, m.business_name, m.office_address, m.office_phone) is not null;
revoke all on public.business_directory from anon, public;
grant select on public.business_directory to authenticated;

-- 6. Check
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, policyname;
