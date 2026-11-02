-- 13 · Business Directory follows the flat's directory consent   (Aakar, decided 2 Nov 2026)
-- Until now the business_directory view (RESIDENT_ACCESS.sql) listed the profession, business name, office address and
-- office phone of EVERY family member to every logged-in user, whether or not the flat had switched on
-- "Share our family details with society members". From now on a member's business entry is listed only when the
-- flat's directory_consent is true (same rule as member_directory), or when the person looking is that flat itself.
-- Before running, the read-only count of 2 Nov 2026 showed: 6 entries listed today, 6 of them from consenting flats,
-- 0 flats would disappear. No data is changed, only the view. Safe to re-run. Undo: 13_UNDO.sql.
-- Run in Supabase > SQL Editor.

create or replace view public.business_directory with (security_invoker = false) as
  select m.id, m.flat_id, m.name, m.occupation, m.business_name, m.business_category, m.office_address, m.office_phone, f.tower
  from public.members m left join public.flats f on f.id = m.flat_id
  where coalesce(m.occupation, m.business_name, m.office_address, m.office_phone) is not null
    and (f.directory_consent = true or m.flat_id = public.my_flat());
revoke all on public.business_directory from anon, public;
grant select on public.business_directory to authenticated;

-- Check: first row true; second row = entries that stay visible to everyone (counts only, no names)
select 'view checks directory_consent' as item, (pg_get_viewdef('public.business_directory'::regclass) like '%directory_consent%')::text as value
union all
select 'entries visible to everyone', count(*)::text
  from public.members m join public.flats f on f.id = m.flat_id
 where coalesce(m.occupation, m.business_name, m.office_address, m.office_phone) is not null and f.directory_consent = true;
