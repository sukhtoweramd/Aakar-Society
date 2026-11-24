-- MT_08 (Nov 2026) - multi-tenant step 4c-4: a new row gets the society of the login that adds it (not always Aakar's).
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_07. Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no data and no table layout, only the DEFAULT of the society_id column on the 39 society tables. Undo: MT_08_UNDO.sql.
--
-- Today the default of society_id is Aakar's id written out. With the society wall (MT_04) a login of a SECOND society could then
-- never save anything without naming its society: the row would be given Aakar's id and the wall would refuse it.
-- New default: public.current_society_or_first() (MT_06) = the society of the logged-in login; for calls made with the server's own
-- key (no login) it is still Aakar's society, exactly as before. For Aakar nothing changes: every Aakar login is in Aakar.
-- TEMPORARY part: the fallback to Aakar for server-key calls stays until step 4d, where each server route names its society.
-- A row that names its society (society_id given in the insert) is untouched by this: only inserts that leave it out use the default.
-- NOT here: the Aakar-only wording and defaults inside the app (login e-mail domain, document prefixes) - own step.

do $$
declare
  t text;
  n int := 0;
  tabs text[] := array[
    'access_log',
    'amc_contracts',
    'amc_visits',
    'app_settings',
    'billing_settings',
    'bills',
    'booking_areas',
    'bookings',
    'businesses',
    'committee_areas',
    'complaints',
    'emergency_contacts',
    'event_checkins',
    'event_money',
    'event_registrations',
    'event_team',
    'events',
    'flat_docs',
    'flat_tenant_logins',
    'flats',
    'help_guide',
    'letter_requests',
    'letter_templates',
    'letters',
    'maintenance',
    'meeting_actions',
    'meetings',
    'members',
    'nomination_status',
    'nominees',
    'notices',
    'payment_reports',
    'payments',
    'signatories',
    'society_contacts',
    'society_live',
    'society_profile',
    'towers',
    'vehicles'];
begin
  if to_regprocedure('public.current_society_or_first()') is null then
    raise exception 'Run MT_06_SETTINGS_PER_SOCIETY.sql first (public.current_society_or_first() is missing).';
  end if;
  foreach t in array tabs loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped % (table not found)', t;
      continue;
    end if;
    execute format('alter table public.%I alter column society_id set default public.current_society_or_first()', t);
    n := n + 1;
  end loop;
  raise notice 'society_id default changed on % tables', n;
end $$;

-- Check: expect 39 tables with the new default, 0 still with Aakar's id written out, 0 nullable, function closed to anon.
with want(t) as (select unnest(array[
    'access_log',
    'amc_contracts',
    'amc_visits',
    'app_settings',
    'billing_settings',
    'bills',
    'booking_areas',
    'bookings',
    'businesses',
    'committee_areas',
    'complaints',
    'emergency_contacts',
    'event_checkins',
    'event_money',
    'event_registrations',
    'event_team',
    'events',
    'flat_docs',
    'flat_tenant_logins',
    'flats',
    'help_guide',
    'letter_requests',
    'letter_templates',
    'letters',
    'maintenance',
    'meeting_actions',
    'meetings',
    'members',
    'nomination_status',
    'nominees',
    'notices',
    'payment_reports',
    'payments',
    'signatories',
    'society_contacts',
    'society_live',
    'society_profile',
    'towers',
    'vehicles']))
select 'tables whose society_id default is the login''s society (expect 39)' as what, count(*)::text as value
  from information_schema.columns c
 where c.table_schema = 'public' and c.column_name = 'society_id' and c.table_name in (select t from want)
   and c.column_default like '%current_society_or_first%'
union all select 'tables still with Aakar''s id written out as default (expect 0)', count(*)::text
  from information_schema.columns c
 where c.table_schema = 'public' and c.column_name = 'society_id' and c.table_name in (select t from want)
   and c.column_default like '%a4a4a4a4-0000-4000-8000-000000000001%'
union all select 'society_id columns that allow null (expect 0)', count(*)::text
  from information_schema.columns c
 where c.table_schema = 'public' and c.column_name = 'society_id' and c.table_name in (select t from want) and c.is_nullable = 'YES'
union all select 'current_society_or_first closed to anon (expect true)', (not has_function_privilege('anon', 'public.current_society_or_first()', 'execute'))::text;
