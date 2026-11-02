-- 13 UNDO · Back to the RESIDENT_ACCESS.sql rule: every family member with business details is listed to every logged-in user.
-- No data is changed. Safe to re-run.

create or replace view public.business_directory with (security_invoker = false) as
  select m.id, m.flat_id, m.name, m.occupation, m.business_name, m.business_category, m.office_address, m.office_phone, f.tower
  from public.members m left join public.flats f on f.id = m.flat_id
  where coalesce(m.occupation, m.business_name, m.office_address, m.office_phone) is not null;
revoke all on public.business_directory from anon, public;
grant select on public.business_directory to authenticated;

select 'view checks directory_consent (expect false)' as item, (pg_get_viewdef('public.business_directory'::regclass) like '%directory_consent%')::text as value;
