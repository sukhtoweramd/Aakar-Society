-- Owner / Tenant support. Run once in Supabase > SQL Editor (after DIRECTORY_CONSENT.sql).
-- Safe to run again.

-- 1. New flat columns
alter table public.flats add column if not exists occupancy text not null default 'owner';
alter table public.flats drop constraint if exists flats_occupancy_check;
alter table public.flats add constraint flats_occupancy_check check (occupancy in ('owner', 'tenant'));
alter table public.flats add column if not exists owner_mobile text;      -- owner's contact when the flat is rented out
alter table public.flats add column if not exists owner_address text;     -- where the owner lives now
alter table public.flats add column if not exists tenant_name text;
alter table public.flats add column if not exists tenant_from date;
alter table public.flats add column if not exists agreement_until date;   -- rent agreement end date

-- 2. Resident guard: once a flat is marked "tenant", the flat login (the tenant) cannot change
--    the owner's details or switch it back to owner-occupied. Only the committee can.
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
  if old.occupancy = 'tenant' and (new.occupancy is distinct from old.occupancy
     or new.owner_name is distinct from old.owner_name or new.owner_mobile is distinct from old.owner_mobile
     or new.owner_address is distinct from old.owner_address or new.email is distinct from old.email) then
    raise exception 'This flat is rented out. Only the committee can change the owner details or mark the tenant as moved out.';
  end if;
  return new;
end $$;

-- 3. Member directory: add occupancy and tenant name (owner's mobile/address are NOT shown to members)
create or replace view public.member_directory with (security_invoker = false) as
  select f.id as flat_id, f.tower, f.floor, f.owner_name, f.is_committee, f.directory_consent as consent,
         m.id as member_id, m.name as member_name, m.relation, m.mobile, coalesce(m.is_head, false) as is_head,
         f.occupancy, f.tenant_name
  from public.flats f
  left join public.members m on m.flat_id = f.id and f.directory_consent = true;
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;

-- 4. Flat list seen by residents: add occupancy and tenant name (like the name board near the lift)
create or replace view public.flat_directory with (security_invoker = false) as
  select id, tower, floor, flat_no, owner_name, is_committee, status, occupancy, tenant_name from public.flats;
revoke all on public.flat_directory from anon, public;
grant select on public.flat_directory to authenticated;

-- 5. Check: every flat should show 'owner' to start with
select occupancy, count(*) from public.flats group by occupancy;
