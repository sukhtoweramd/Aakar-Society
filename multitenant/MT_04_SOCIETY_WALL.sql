-- MT_04 (Nov 2026) - multi-tenant step 4b: the society wall on every society table.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01, MT_02, MT_03 (and after the app with PR #98 is live: new logins join a society).
-- Safe to run again. Changes no data. Undo: MT_04_UNDO.sql (drops the wall again).
--
-- What it does: ONE extra rule per table, added on top of the existing rules (a RESTRICTIVE rule must pass in addition to them):
--   a logged-in login may read / add / change / delete only rows whose society_id is its own society (active_society(), MT_03).
-- For Aakar nothing changes: every Aakar row has Aakar's id and every Aakar login belongs to Aakar.
-- A login with NO membership has no society and sees nothing, so the check at the bottom must show 0 such logins before this is run on live.
--
-- NOT covered here (later steps): the server's own routes (they use the secret key, which skips table rules), database functions that run
-- with owner rights, and the three directory views. Those get their own society check in step 4d.
-- The default for society_id stays Aakar's id for now (step 4c changes it together with the per-society keys).

do $$
declare
  t text;
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
    if to_regclass('public.' || t) is null then
      raise notice 'skipped % (table not found)', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists society_wall on public.%I', t);
    execute format('create policy society_wall on public.%I as restrictive for all to authenticated using (society_id = (select public.active_society())) with check (society_id = (select public.active_society()))', t);
  end loop;
end $$;

-- Check: expect 39 walls, all restrictive; 0 logins with a role but no membership; 0 tables that exist without a wall.
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
walls as (select tablename as t, bool_and(not permissive) as restrictive from pg_policies where schemaname = 'public' and policyname = 'society_wall' group by tablename)
select 'tables with a society wall' as what, count(*)::text as value from walls where t in (select t from want)
union all select 'walls that are restrictive (expect the same number)', count(*)::text from walls where restrictive and t in (select t from want)
union all select 'tables without a wall (expect none)', coalesce(string_agg(t, ', '), 'none') from want where to_regclass('public.' || t) is not null and t not in (select t from walls)
union all select 'logins with a role but no membership (expect 0)', count(*)::text from auth.users u
  where u.raw_app_meta_data ->> 'role' in ('committee', 'resident', 'tenant')
    and not exists (select 1 from public.society_memberships m where m.user_id = u.id);
