-- FLAT_SETUP_TABLES.sql · the society's own details and towers become data (Aakar, draft 19 Nov 2026)
--
-- What it does: creates TWO new tables and fills them with what the app has so far kept inside its code:
--   society_profile (one row): name, registration, address, city, public web address  (now in lib/society.ts: SOCIETY)
--   towers: one row per tower code with its display name and whether the top floor has a terrace
--           (now in lib/society.ts: TERRACE_TOWERS = A and C). The tower codes are READ from the flats you already have.
-- It does NOT touch the flats table or any other table: no flat is added, changed or removed. The app does not read the new
-- tables yet, so nothing on screen changes. Later code reads them and falls back to today's values when they are empty.
-- Who can change them: only the main admin (is_main_admin(), AREAS_BACKUPS.sql). Every login can read them.
-- A tower cannot be deleted or re-coded while flats use it.
-- Run once in Supabase > SQL Editor, after AREAS_BACKUPS.sql. Safe to run again (it never overwrites edited rows).
-- Then run sql-security/14_RESTORE_flat_setup_tables.sql so backups and restores include the two tables.
-- Take a backup first (ADMIN > BACKUP & RESTORE > DOWNLOAD FULL BACKUP). Undo: FLAT_SETUP_TABLES_UNDO.sql.

-- 1. Society profile (always one row: id = 1)
create table if not exists public.society_profile (
  id            int primary key default 1 check (id = 1),
  name          text not null check (length(trim(name)) > 0),
  full_name     text not null check (length(trim(full_name)) > 0),
  reg_no        text,
  reg_date      text,                              -- kept as printed, e.g. 16-03-1994
  building      text,
  address       text,
  address_lines text[] not null default '{}',      -- the lines printed under the letterhead
  city          text,
  public_url    text,
  updated_by    text,
  updated_at    timestamptz not null default now()
);
alter table public.society_profile enable row level security;
drop policy if exists everyone_reads on public.society_profile;
drop policy if exists main_admin_adds on public.society_profile;
drop policy if exists main_admin_changes on public.society_profile;
create policy everyone_reads      on public.society_profile for select to authenticated using (true);
create policy main_admin_adds     on public.society_profile for insert to authenticated with check (public.is_main_admin());
create policy main_admin_changes  on public.society_profile for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
revoke all on public.society_profile from anon;
grant select, insert, update, delete on public.society_profile to authenticated, service_role;

-- 2. Towers
create table if not exists public.towers (
  code        text primary key check (code ~ '^[A-Za-z0-9_-]{1,10}$'),
  name        text not null check (length(trim(name)) between 1 and 60),
  has_terrace boolean not null default false,      -- the top floor owns a terrace (higher maintenance)
  sort        int not null default 100,
  active      boolean not null default true,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.towers enable row level security;
drop policy if exists everyone_reads on public.towers;
drop policy if exists main_admin_adds on public.towers;
drop policy if exists main_admin_changes on public.towers;
drop policy if exists main_admin_deletes on public.towers;
create policy everyone_reads      on public.towers for select to authenticated using (true);
create policy main_admin_adds     on public.towers for insert to authenticated with check (public.is_main_admin());
create policy main_admin_changes  on public.towers for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());
create policy main_admin_deletes  on public.towers for delete to authenticated using (public.is_main_admin());
revoke all on public.towers from anon;
grant select, insert, update, delete on public.towers to authenticated, service_role;

-- a tower that flats use keeps its code and cannot be deleted (also holds for the server's own key, which skips the rules above)
create or replace function public.towers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  select count(*) into used from public.flats f where trim(f.tower) = old.code;
  if tg_op = 'DELETE' and used > 0 then
    raise exception 'Tower % is used by % flat(s) and cannot be deleted. Switch it off instead.', old.code, used;
  end if;
  if tg_op = 'UPDATE' and new.code is distinct from old.code and used > 0 then
    raise exception 'Tower % is used by % flat(s); its code cannot be changed.', old.code, used;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.towers_guard() from public, anon, authenticated;
drop trigger if exists towers_guard on public.towers;
create trigger towers_guard before update or delete on public.towers for each row execute function public.towers_guard();

-- 3. Fill: Aakar's current values, copied from lib/society.ts (SOCIETY, TERRACE_TOWERS). Only when the tables are empty,
--    so running the script again never brings back a row that was edited or deleted on purpose.
insert into public.society_profile (id, name, full_name, reg_no, reg_date, building, address, address_lines, city, public_url)
values (1, 'AAKAR CO-OP', 'AAKAR CO-OP HOUSING SOCIETY LTD.', 'G-16551', '16-03-1994', 'SUKH TOWER',
        'Sukh Tower, Mirambica Road, Naranpura, Ahmedabad',
        array['Mirambica Road, Naranpura', 'Ahmedabad - 380013'], 'Ahmedabad', 'https://aakarsociety.vercel.app')
on conflict (id) do nothing;

-- tower codes come from the flats themselves; terrace towers A and C as in the code today (B has none)
insert into public.towers (code, name, has_terrace, sort)
select t.code, 'Tower ' || t.code, t.code in ('A', 'C'), (row_number() over (order by t.code))::int * 10
  from (select distinct trim(tower) as code from public.flats where nullif(trim(tower), '') is not null) t
 where not exists (select 1 from public.towers);

-- Check (read only). Expected: both tables true • rules on true • anon can read none (false) • profile rows 1 •
--   towers = the tower codes in your flats (see the list) • towers used by flats but missing here = 0 • flats count = your snapshot
select 'society_profile table' as item, (to_regclass('public.society_profile') is not null)::text as value
union all select 'towers table', (to_regclass('public.towers') is not null)::text
union all select 'row security on (both)', (select bool_and(relrowsecurity) from pg_class where oid in ('public.society_profile'::regclass, 'public.towers'::regclass))::text
union all select 'rules on society_profile (expect 3)', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'society_profile'
union all select 'rules on towers (expect 4)', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'towers'
union all select 'anon can read either (expect false)', (has_table_privilege('anon', 'public.society_profile', 'select') or has_table_privilege('anon', 'public.towers', 'select'))::text
union all select 'tower guard on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'towers_guard' and not tgisinternal)::text
union all select 'society_profile rows (expect 1)', count(*)::text from public.society_profile
union all select 'towers (code · name · terrace)', coalesce(string_agg(code || ' · ' || name || ' · ' || has_terrace::text, '  |  ' order by sort, code), '(none)') from public.towers
union all select 'tower codes used by flats but missing here (expect 0)',
       (select count(distinct trim(f.tower))::text from public.flats f
         where nullif(trim(f.tower), '') is not null and not exists (select 1 from public.towers t where t.code = trim(f.tower)))
union all select 'flats in the database (compare with your snapshot)', count(*)::text from public.flats;
