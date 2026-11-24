-- Undo of MT_08_SOCIETY_DEFAULT.sql: the default of society_id is Aakar's id written out again, on the 39 society tables.
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
  foreach t in array tabs loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I alter column society_id set default %L', t, aakar);
  end loop;
end $$;

select 'tables with Aakar''s id as default again (expect 39)' as what, count(*)::text as value
  from information_schema.columns c
 where c.table_schema = 'public' and c.column_name = 'society_id' and c.column_default like '%a4a4a4a4-0000-4000-8000-000000000001%';
