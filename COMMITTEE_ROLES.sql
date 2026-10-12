-- Committee designations (Chairman, Secretary, Treasurer …). Run once in Supabase > SQL Editor.
-- Safe to run again.

-- 1. New column
alter table public.flats add column if not exists committee_role text;

-- 2. Move titles typed into the owner name ("Ramesh Patel - Secretary") into the new column.
--    Only touches committee flats whose name contains " - ".
update public.flats
   set committee_role = initcap(trim(split_part(owner_name, ' - ', 2))),
       owner_name     = trim(split_part(owner_name, ' - ', 1))
 where is_committee and owner_name like '% - %' and committee_role is null;

-- 3. Residents cannot change the committee designation (only the committee can)
create or replace function public.flats_resident_guard() returns trigger
language plpgsql as $$
begin
  if public.is_committee() then return new; end if;
  if new.id is distinct from old.id or new.tower is distinct from old.tower or new.floor is distinct from old.floor
     or new.flat_no is distinct from old.flat_no or new.bhk is distinct from old.bhk
     or new.maintenance is distinct from old.maintenance or new.sqft is distinct from old.sqft
     or new.status is distinct from old.status or new.is_committee is distinct from old.is_committee
     or new.committee_role is distinct from old.committee_role
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

-- 4. Show the designation in the member directory and the residents' flat list
create or replace view public.member_directory with (security_invoker = false) as
  select f.id as flat_id, f.tower, f.floor, f.owner_name, f.is_committee, f.directory_consent as consent,
         m.id as member_id, m.name as member_name, m.relation, m.mobile, coalesce(m.is_head, false) as is_head,
         f.occupancy, f.tenant_name, f.committee_role
  from public.flats f
  left join public.members m on m.flat_id = f.id and f.directory_consent = true;
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;

create or replace view public.flat_directory with (security_invoker = false) as
  select id, tower, floor, flat_no, owner_name, is_committee, status, occupancy, tenant_name, committee_role from public.flats;
revoke all on public.flat_directory from anon, public;
grant select on public.flat_directory to authenticated;

-- 5. Check: committee flats with their designation
select id, owner_name, committee_role from public.flats where is_committee order by id;
