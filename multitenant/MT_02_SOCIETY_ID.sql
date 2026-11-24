-- MT_02 (Nov 2026) - multi-tenant step 3: every society table gets a society_id, filled with Aakar's id.
-- Run by hand in the Supabase SQL Editor AFTER MT_01_SOCIETIES.sql and a full backup. Safe to run again.
-- Aakar keeps working exactly as today: the column has Aakar as its default, so nothing the app writes has to change, and
-- existing rows are not rewritten (no trigger fires, no rule changes). Nothing READS society_id yet - that is step 4.
-- Left out on purpose: zz_security_app_meta_backup (a one-off copy of login data, not society data).
-- Undo: MT_02_UNDO.sql.

do $$
declare
  t text;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
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
  if not exists (select 1 from public.societies where id = aakar) then
    raise exception 'Run MT_01_SOCIETIES.sql first (Aakar is not in public.societies).';
  end if;
  foreach t in array tabs loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped % (table not found)', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists society_id uuid not null default %L references public.societies(id)', t, aakar);
    execute format('create index if not exists %I on public.%I (society_id)', t || '_society_idx', t);
  end loop;
end $$;

-- Check: expect 39 tables with the column, 0 rows that are not Aakar's, 0 tables missing it.
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
    'vehicles'])),
have as (
  select c.table_name as t from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'society_id' and c.is_nullable = 'NO'
     and c.column_default like '%a4a4a4a4-0000-4000-8000-000000000001%')
select 'tables with society_id (Aakar default, not null)' as what, count(*)::text as value from have where t in (select t from want)
union all select 'expected tables that exist', count(*)::text from want where to_regclass('public.' || t) is not null
union all select 'missing the column', coalesce(string_agg(t, ', '), 'none') from want where to_regclass('public.' || t) is not null and t not in (select t from have)
union all select 'rows in flats / members / bills that are not Aakar',
  ((select count(*) from public.flats where society_id <> 'a4a4a4a4-0000-4000-8000-000000000001')
 + (select count(*) from public.members where society_id <> 'a4a4a4a4-0000-4000-8000-000000000001')
 + (select count(*) from public.bills where society_id <> 'a4a4a4a4-0000-4000-8000-000000000001'))::text;
