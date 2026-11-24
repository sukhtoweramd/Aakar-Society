-- BASE_TABLES.sql · the six core tables, rebuilt from the live database (24 Nov 2026) · for a NEW database only
-- Why: these tables were made by the old SUPABASE_SETUP.sql (removed in the Oct 2026 audit) and by no script in this repo.
-- Rebuilt from queries run on the live Aakar database: columns and defaults, keys, links, check rules, indexes.
-- Run FIRST on a new database (the aanganone test copy, a new society), before every other script. Safe to re-run.
-- Row rules (policies) are NOT here: RESIDENT_ACCESS.sql and the later scripts create them.
-- Do NOT run on the live Aakar database: it already has these tables.
-- Known to change in multi-tenancy step 4: the keys on flats, and the check flats_tower_check (only towers A, B, C).

create table if not exists public.flats (
  id                   text primary key,
  tower                text constraint flats_tower_check check (tower = any (array['A','B','C'])),
  floor                integer,
  flat_no              text constraint flats_flat_no_key unique,
  bhk                  text,
  maintenance          integer,
  edit_code            text constraint flats_edit_code_key unique,
  email                text,
  owner_name           text,
  is_committee         boolean default false,
  status               text default 'pending',
  r2_url               text,
  sqft                 integer,
  directory_consent    boolean not null default false,
  directory_consent_at timestamptz,
  directory_consent_by text,
  occupancy            text not null default 'owner' constraint flats_occupancy_check check (occupancy = any (array['owner','tenant'])),
  owner_mobile         text,
  owner_address        text,
  tenant_name          text,
  tenant_from          date,
  agreement_until      date,
  committee_role       text,
  member_since         date,
  share_cert_no        text,
  committee_person     text,
  committee_members    jsonb not null default '[]'::jsonb
);

create table if not exists public.members (
  id                uuid primary key default gen_random_uuid(),
  flat_id           text references public.flats(id),
  name              text,
  relation          text,
  mobile            text,
  age               integer,
  is_head           boolean default false,
  occupation        text,
  business_name     text,
  business_category text,
  office_address    text,
  office_phone      text,
  email             text,
  dob               date constraint members_dob_check check (dob is null or (dob >= date '1900-01-01' and dob <= current_date))
);

create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  content      text,
  tower        text,
  created_at   timestamptz default now(),
  file_url     text,
  created_by   text,
  is_banner    boolean not null default false,
  banner_until date
);

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  title            text,
  event_date       date,
  type             text,
  description      text,
  end_date         date,
  fund_per_flat    numeric,
  pass_price       numeric,
  accounts_public  boolean not null default false,
  guest_pass_price numeric,
  pass_sessions    jsonb not null default '[]'::jsonb,
  reg_open         boolean not null default false,
  reg_deadline     timestamptz,
  reg_upi          text,
  reg_prefill      boolean not null default true
);

-- old tables (0 rows on Aakar, not used by any screen; still in the backup list). Kept so scripts and backups find them.
create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  flat_id       text references public.flats(id),
  business_name text,
  category      text,
  mobile        text,
  description   text
);
create table if not exists public.maintenance (
  id       uuid primary key default gen_random_uuid(),
  flat_id  text references public.flats(id),
  month    text,
  amount   integer,
  status   text,
  paid_at  timestamptz
);

-- access: rules on, no access for the public, logged-in logins and the server only (CLAUDE.md)
do $$ declare t text; begin
  foreach t in array array['flats','members','notices','events','businesses','maintenance'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

-- check: six tables, no rows
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname) as columns
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where c.relname in ('flats','members','notices','events','businesses','maintenance')
 order by 1;
-- expected columns: businesses 6, events 15, flats 27, maintenance 6, members 14, notices 9
