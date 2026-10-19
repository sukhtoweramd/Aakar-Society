-- Committee areas of responsibility + AMC register (annual maintenance contracts) with service visits.
-- Run once in Supabase > SQL Editor. Safe to run again. Does NOT change existing data
-- (the starting list of areas is added only when there are no areas yet).

-- 1. Areas of responsibility: one accountable committee member per area (members see "who to contact")
create table if not exists public.committee_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  holder_flat text references public.flats(id) on delete set null,   -- committee member's flat
  backup_flat text references public.flats(id) on delete set null,
  contact_phone text,                                                 -- shown to members only if filled in
  sort int not null default 100,
  active boolean not null default true,
  updated_by text, updated_at timestamptz default now()
);
insert into public.committee_areas (name, description, sort)
select v.name, v.description, v.sort from (values
  ('Accounts & bank', 'Bills, receipts, bank, auditor', 10),
  ('Lift', 'All three towers; lift AMC and breakdowns', 20),
  ('Water & borewell', 'Borewell, pumps, tanks, tanker water', 30),
  ('Security agency', 'Guards, gate, MyGate', 40),
  ('Housekeeping & garden', 'Cleaning staff, garden, garbage', 50),
  ('Electricity & generator', 'Common lights, meters, generator', 60),
  ('Repairs & civil works', 'Leakage, painting, plumbing in common areas', 70),
  ('Legal, documents & NOC', 'Share certificates, transfers, NOC letters', 80),
  ('Member relations & complaints', 'Member requests, notices, disputes', 90),
  ('Events & festivals', 'Garba, festivals, functions', 100)
) as v(name, description, sort)
where not exists (select 1 from public.committee_areas);

-- 2. AMC contracts
create table if not exists public.amc_contracts (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.committee_areas(id) on delete set null,
  vendor text not null,
  contact_person text, contact_phone text,
  covers text not null,                          -- e.g. "Lifts – Tower A, B, C"
  start_date date not null, end_date date not null check (end_date >= start_date),
  amount numeric(12,2) check (amount is null or amount >= 0),
  payment_terms text,                            -- e.g. Quarterly in advance
  visits_per_year int check (visits_per_year is null or visits_per_year >= 0),
  file_key text,                                 -- link to the contract copy in file storage (amc/ folder)
  notes text,
  status text not null default 'active' check (status in ('active', 'renewed', 'closed')),
  renewed_from uuid references public.amc_contracts(id) on delete set null,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create index if not exists amc_contracts_end_idx on public.amc_contracts(end_date);

-- 3. Service visits under a contract
create table if not exists public.amc_visits (
  id uuid primary key default gen_random_uuid(),
  amc_id uuid not null references public.amc_contracts(id) on delete cascade,
  visit_date date not null,
  done_by text,                                  -- technician / vendor person
  work text,                                     -- what was done / found
  checked_by text,                               -- committee member who checked
  created_by text, created_at timestamptz not null default now()
);
create index if not exists amc_visits_amc_idx on public.amc_visits(amc_id);

-- 4. Access: areas readable by every logged-in member, changed by the committee; AMC committee only
do $$ declare t text; p record; begin
  foreach t in array array['committee_areas','amc_contracts','amc_visits'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy members_read on public.committee_areas for select to authenticated using (active);

-- 5. Backups and restore include these tables
create or replace function public.restore_society_backup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ins text[] := array['flats','billing_settings','signatories','events','notices','maintenance','businesses',
                      'members','emergency_contacts','vehicles','flat_docs','bills','payments','letters','payment_reports','committee_areas','amc_contracts','amc_visits'];
  t text; i int; cols text; n int; seq text; col record; result jsonb := '{}'::jsonb;
begin
  if p is null or p->>'app' is distinct from 'aakar-society' or jsonb_typeof(p->'tables') <> 'object' then
    raise exception 'This is not an Aakar Society backup file.';
  end if;
  if not (p->'tables' ? 'flats') or jsonb_array_length(p->'tables'->'flats') = 0 then
    raise exception 'The backup has no flats; restore stopped.';
  end if;
  -- remove current records, children first (only tables that are in the backup)
  for i in reverse array_length(ins, 1)..1 loop
    t := ins[i];
    if to_regclass('public.' || t) is not null and (p->'tables') ? t then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
  -- put the backup's records back, parents first
  foreach t in array ins loop
    if to_regclass('public.' || t) is null or not ((p->'tables') ? t) then continue; end if;
    if jsonb_array_length(p->'tables'->t) = 0 then result := result || jsonb_build_object(t, 0); continue; end if;
    select string_agg(quote_ident(a.attname), ',') into cols
      from pg_attribute a
     where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and (p->'tables'->t->0) ? a.attname;
    execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)',
                   t, cols, cols, t) using p->'tables'->t;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(t, n);
    -- keep running numbers (ids) ahead of the restored rows
    for col in select a.attname from pg_attribute a
                where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped loop
      seq := pg_get_serial_sequence('public.' || t, col.attname);
      if seq is not null then
        execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', seq, col.attname, t);
      end if;
    end loop;
  end loop;
  return result;
end $$;
revoke all on function public.restore_society_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_society_backup(jsonb) to service_role;

-- 6. Check: areas (starting list), rules on the three tables
select 'areas' as item, count(*)::text as value from public.committee_areas
union all
select 'rules', count(*)::text from pg_policies where schemaname = 'public' and tablename in ('committee_areas','amc_contracts','amc_visits');
