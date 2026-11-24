-- MT_06 (Nov 2026) - multi-tenant step 4c-2: the one-row settings tables become one row PER SOCIETY.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_05 and AFTER the app with PR "MT_06" (profile save without onConflict) is live.
-- Try it on the test project ("aanganone") first. Safe to run again. Changes no data. Undo: MT_06_UNDO.sql (only while one society exists).
--
-- The five settings tables (billing_settings, app_settings, society_profile, help_guide, society_live) each hold ONE row with id = 1.
--   1. Their key becomes (society_id, id): still id = 1 and still "check (id = 1)", so every screen that reads "the row with id 1"
--      keeps working unchanged - the society wall (MT_04) shows each login only its own society's row. Aakar's row is untouched.
--   2. The database functions that count bill / receipt / letter / other numbers (and clear test data) say "update billing_settings ... where id = 1".
--      With two societies that would move BOTH societies' counters. The script rewrites each such function from its CURRENT live text:
--      "where id = 1"  ->  "where society_id = public.current_society_or_first() and id = 1".
--   3. New helper public.current_society_or_first() = the logged-in login's society; for calls made with the server's own key (no login,
--      e.g. clearing test data) it falls back to Aakar's society. TEMPORARY: step 4d replaces the fallback with an explicit society.
-- Nothing in the app changes for Aakar: one society, one row each, same ids, same numbers.
-- NOT here: the keys of flats / towers / nomination_status, and the society_id default (next scripts).

-- 1. Helper (temporary fallback to the first society, see above) --------------------------------------------------------------------
create or replace function public.current_society_or_first() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.active_society(), 'a4a4a4a4-0000-4000-8000-000000000001'::uuid)
$$;
revoke all on function public.current_society_or_first() from public, anon;
grant execute on function public.current_society_or_first() to authenticated, service_role;

-- 2. Keys: (society_id, id) on the five settings tables -------------------------------------------------------------------------------
do $$
declare
  t text;
  pk text;
  cols text;
begin
  foreach t in array array['billing_settings', 'app_settings', 'society_profile', 'help_guide', 'society_live'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    select con.conname,
           (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any (con.conkey))
      into pk, cols
      from pg_constraint con where con.conrelid = ('public.' || t)::regclass and con.contype = 'p';
    if cols = 'id,society_id' then continue; end if;       -- already done
    if pk is not null then execute format('alter table public.%I drop constraint %I', t, pk); end if;
    execute format('alter table public.%I add constraint %I primary key (society_id, id)', t, t || '_pkey');
  end loop;
end $$;

-- 3. The functions that use "where id = 1" on these tables get the society in front (rewritten from the live definition) -------------
do $$
declare
  f record;
  def text;
  newdef text;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.prosrc ~* '\mwhere id = 1\M'
       and p.prosrc ~* '(billing_settings|app_settings|society_profile|help_guide|society_live)'
       and p.prosrc not like '%current_society_or_first()%'
  loop
    def := pg_get_functiondef(f.oid);
    newdef := regexp_replace(def, '\mwhere id = 1\M', 'where society_id = public.current_society_or_first() and id = 1', 'gi');
    if newdef <> def then
      execute newdef;
      raise notice 'rewritten: %', f.proname;
    end if;
  end loop;
end $$;

-- 4. Check ----------------------------------------------------------------------------------------------------------------------------
with five(t) as (values ('billing_settings'), ('app_settings'), ('society_profile'), ('help_guide'), ('society_live')),
present as (select t from five where to_regclass('public.' || t) is not null),
keyed as (select p.t from present p
          where (select string_agg(a.attname, ',' order by a.attname) from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
                 where con.conrelid = ('public.' || p.t)::regclass and con.contype = 'p') = 'id,society_id')
select 'settings tables keyed by (society_id, id) (expect ' || (select count(*) from present) || ')' as what, (select count(*)::text from keyed) as value
union all select 'functions still saying "where id = 1" without the society (expect none)',
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
              and p.prosrc ~* '\mwhere id = 1\M' and p.prosrc ~* '(billing_settings|app_settings|society_profile|help_guide|society_live)'
              and p.prosrc not like '%current_society_or_first()%'), 'none')
union all select 'functions now counting inside the society',
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosrc like '%current_society_or_first()%'
              and p.proname <> 'current_society_or_first'), 'none')
union all select 'rows per settings table (billing / app / profile / guide / live)',
  coalesce((select count(*)::text from public.billing_settings), '-') || ' / ' || coalesce((select count(*)::text from public.app_settings), '-') || ' / '
  || coalesce((select count(*)::text from public.society_profile), '-') || ' / ' || coalesce((select count(*)::text from public.help_guide), '-') || ' / '
  || coalesce((select count(*)::text from public.society_live), '-');
