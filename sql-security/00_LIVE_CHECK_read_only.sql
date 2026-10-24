-- 00 · LIVE CHECK (READ ONLY) — Aakar security fixes, Oct 2026
-- Changes NOTHING. Run in Supabase > SQL Editor and send back the whole result (one table: section | item | value).
-- It lists committee (non-flat) logins by email so you can confirm which are real; flat logins are only counted.

with u as (
  select id, email, created_at, last_sign_in_at, email_confirmed_at,
         raw_app_meta_data, coalesce((to_jsonb(au) ->> 'is_anonymous')::boolean, false) as anon
  from auth.users au
),
fn as (
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select * from (
  -- 1. Logins
  select 1 as s, 'logins' as section, 'total' as item, count(*)::text as value from u
  union all select 1, 'logins', 'flat logins (role resident)', count(*)::text from u where raw_app_meta_data ->> 'role' = 'resident'
  union all select 1, 'logins', 'role = committee', count(*)::text from u where raw_app_meta_data ->> 'role' = 'committee'
  union all select 1, 'logins', 'NO role (treated as committee today)', count(*)::text from u where coalesce(raw_app_meta_data ->> 'role', '') = ''
  union all select 1, 'logins', 'other role values', coalesce(string_agg(distinct raw_app_meta_data ->> 'role', ', '), 'none') from u where raw_app_meta_data ->> 'role' not in ('resident', 'committee')
  union all select 1, 'logins', 'anonymous logins', count(*)::text from u where anon
  union all select 1, 'logins', 'flat-style email but not resident', count(*)::text from u where email like '%@flats.aakarsociety.app' and coalesce(raw_app_meta_data ->> 'role', '') <> 'resident'
  -- 2. Every non-flat login (these are treated as committee today)
  union all
  select 2, 'non-flat login', coalesce(email, '(no email)'),
         'role=' || coalesce(raw_app_meta_data ->> 'role', 'NONE')
         || ' | flat=' || coalesce(raw_app_meta_data ->> 'flat_id', '-')
         || ' | provider=' || coalesce(raw_app_meta_data ->> 'provider', '-')
         || ' | anonymous=' || anon::text
         || ' | created=' || to_char(created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')
         || ' | last login=' || coalesce(to_char(last_sign_in_at at time zone 'Asia/Kolkata', 'DD Mon YYYY'), 'never')
         || ' | email confirmed=' || (email_confirmed_at is not null)::text
  from u where coalesce(raw_app_meta_data ->> 'role', '') <> 'resident'
  -- 3. How committee and flat are decided in the database today
  union all select 3, 'function', 'is_committee()', coalesce((select def from fn where proname = 'is_committee'), 'MISSING')
  union all select 3, 'function', 'my_flat()', coalesce((select def from fn where proname = 'my_flat'), 'MISSING')
  -- 4. Newer scripts: have they been run?
  union all select 4, 'script EVENT_REGISTRATION', 'table event_registrations', (to_regclass('public.event_registrations') is not null)::text
  union all select 4, 'script EVENT_REGISTRATION', 'functions (expect 4)', (select count(*)::text from fn where proname in ('set_event_registration','register_for_event','submit_event_payment','verify_event_payment'))
  union all select 4, 'script EVENT_REGISTRATION', 'latest version (shows what was bought)', coalesce((select (def like '%guest%' and def like '%taker%')::text from fn where proname = 'verify_event_payment'), 'false')
  union all select 4, 'script PAYMENT_AI', 'function utr_already_reported', (exists (select 1 from fn where proname = 'utr_already_reported'))::text
  union all select 4, 'script HELP_GUIDE', 'table help_guide', (to_regclass('public.help_guide') is not null)::text
  union all select 4, 'script HELP_GUIDE', 'guide saved in database', case when to_regclass('public.help_guide') is null then 'n/a' else 'see app' end
  union all select 4, 'script STORAGE_STATS', 'function storage_stats', (exists (select 1 from fn where proname = 'storage_stats'))::text
  -- 5. flats.edit_code and the guard trigger that refers to it
  union all select 5, 'flats', 'column edit_code exists', (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flats' and column_name = 'edit_code'))::text
  union all select 5, 'flats', 'guard function mentions edit_code', coalesce((select (def like '%edit_code%')::text from fn where proname = 'flats_resident_guard'), 'guard function MISSING')
  union all select 5, 'flats', 'trigger on flats', coalesce((select string_agg(tgname, ', ') from pg_trigger where tgrelid = 'public.flats'::regclass and not tgisinternal), 'none')
  union all select 5, 'flats', 'all columns', (select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'flats')
  -- 6. Restore function: which tables does it restore?
  union all select 6, 'restore_society_backup', 'includes event_registrations', coalesce((select (def like '%event_registrations%')::text from fn where proname = 'restore_society_backup'), 'MISSING')
  union all select 6, 'restore_society_backup', 'includes help_guide', coalesce((select (def like '%help_guide%')::text from fn where proname = 'restore_society_backup'), 'MISSING')
  -- 7. Row-level security overview
  union all select 7, 'rls', 'public tables WITHOUT row-level security', coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'none')
  union all select 7, 'rls', 'tables anon can still read', coalesce((select string_agg(distinct table_name, ', ') from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT'), 'none')
  union all select 7, 'rls', 'policies in public schema', (select count(*)::text from pg_policies where schemaname = 'public')
) x
order by s, item;
