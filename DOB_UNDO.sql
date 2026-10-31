-- DOB_UNDO.sql · back to age only. The member directory loses the birthday columns. Dates of birth already entered are KEPT
-- in members.dob (the column stays, unused) so nothing is lost; drop it by hand only if you really want to.
-- Run in Supabase > SQL Editor. Safe to re-run.
drop view if exists public.member_directory;
create view public.member_directory with (security_invoker = false) as
  select f.id as flat_id, f.tower, f.floor, f.owner_name, f.is_committee, f.directory_consent as consent,
         m.id as member_id, m.name as member_name, m.relation, m.mobile, coalesce(m.is_head, false) as is_head,
         f.occupancy, f.tenant_name, f.committee_role
  from public.flats f
  left join public.members m on m.flat_id = f.id and f.directory_consent = true;
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated, service_role;

select 'directory birthday columns (expect 0)' as item, count(*)::text as value from information_schema.columns where table_schema = 'public' and table_name = 'member_directory' and column_name in ('birth_day', 'birth_month');
