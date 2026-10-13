-- Pre-Phase 2 (part A): vehicles, emergency contacts, document types, member since.
-- Run once in Supabase > SQL Editor (after COMMITTEE_ROLES.sql). Safe to run again.

-- 1. Vehicles of the people living in each flat (tenant's vehicles for a rented flat)
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  flat_id text not null references public.flats(id) on delete cascade,
  vtype text not null check (vtype in ('Cycle', '2-wheeler', '4-wheeler compact', '4-wheeler SUV', 'Others')),
  model text,
  plate text,
  created_at timestamptz not null default now()
);
create index if not exists vehicles_flat_idx on public.vehicles(flat_id);

-- 2. Emergency contacts outside the society (committee and the flat itself only)
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  flat_id text not null references public.flats(id) on delete cascade,
  name text not null,
  relation text,
  phone text not null,
  location text,
  created_at timestamptz not null default now()
);
create index if not exists emergency_contacts_flat_idx on public.emergency_contacts(flat_id);

-- 3. Document type for files in a flat's FLAT DOCUMENTS (the file itself stays in R2)
create table if not exists public.flat_docs (
  key text primary key,               -- R2 key, e.g. flats/A702/1760000000000_sale_deed.pdf
  flat_id text not null references public.flats(id) on delete cascade,
  doc_type text,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists flat_docs_flat_idx on public.flat_docs(flat_id);

-- 4. Access rules: committee everything; a flat login only its own flat's rows
do $$
declare t text; p record;
begin
  foreach t in array array['vehicles','emergency_contacts','flat_docs'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
    execute format('create policy resident_own on public.%I for all to authenticated using (flat_id = public.my_flat()) with check (flat_id = public.my_flat())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 5. Membership details on the flat (kept by the committee, shown to the flat)
alter table public.flats add column if not exists member_since date;
alter table public.flats add column if not exists share_cert_no text;

-- 6. Residents cannot change membership details (committee only)
create or replace function public.flats_resident_guard() returns trigger
language plpgsql as $$
begin
  if public.is_committee() then return new; end if;
  if new.id is distinct from old.id or new.tower is distinct from old.tower or new.floor is distinct from old.floor
     or new.flat_no is distinct from old.flat_no or new.bhk is distinct from old.bhk
     or new.maintenance is distinct from old.maintenance or new.sqft is distinct from old.sqft
     or new.status is distinct from old.status or new.is_committee is distinct from old.is_committee
     or new.committee_role is distinct from old.committee_role
     or new.member_since is distinct from old.member_since or new.share_cert_no is distinct from old.share_cert_no
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

-- 7. Check: three new tables, each with two access rules
select tablename, count(*) as rules from pg_policies
where schemaname = 'public' and tablename in ('vehicles','emergency_contacts','flat_docs')
group by tablename order by tablename;
