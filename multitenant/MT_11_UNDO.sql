-- MT_11_UNDO.sql (Nov 2026) - puts the functions changed by MT_11 back exactly as they were (from the copy MT_11 saved in zz_mt11_function_backup).
-- Run by hand in the Supabase SQL Editor. Safe to run again. Changes no table and no data. If a later script changed any of these functions again,
-- this puts them back to the text they had before MT_11 (so run it only when you mean to go back to before MT_11).
do $$
declare r record; flat_blockers_def text;
begin
  if to_regclass('public.zz_mt11_function_backup') is null then
    raise exception 'There is no saved copy (zz_mt11_function_backup): MT_11 was not run here. Nothing was changed.';
  end if;
  for r in select fn, def from public.zz_mt11_function_backup where fn <> 'public.flat_blockers(text[])' order by fn loop
    execute r.def;
  end loop;
  select def into flat_blockers_def from public.zz_mt11_function_backup where fn = 'public.flat_blockers(text[])';
  if flat_blockers_def is not null then
    execute flat_blockers_def;                                                   -- the one-argument form
    if to_regprocedure('public.flat_blockers(text[],uuid)') is not null then drop function public.flat_blockers(text[], uuid); end if;
    revoke all on function public.flat_blockers(text[]) from public, anon, authenticated;
    grant execute on function public.flat_blockers(text[]) to service_role;
  end if;
end $$;

-- Check
select 'lookup functions back to the original, none names the login''s society (expect 0)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('flat_is_rented', 'flat_has_tenant_login', 'my_tenant_flat', 'can_assign_areas', 'can_approve_letters',
                             'can_approve_booking', 'my_flat_is_committee', 'committee_people', 'flat_people_counts', 'bill_is_tenant')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value
union all select 'area_rights has its temporary fallback again (expect yes)',
       case when pg_get_functiondef('public.area_rights()'::regprocedure) ~* 'current_society_or_first' then 'yes' else 'NO' end
union all select 'flat_blockers is the one-argument form again (expect yes)',
       case when to_regprocedure('public.flat_blockers(text[])') is not null and to_regprocedure('public.flat_blockers(text[],uuid)') is null then 'yes' else 'NO' end
union all select 'flat_blockers: server key only (expect true / false)',
       coalesce((has_function_privilege('service_role', 'public.flat_blockers(text[])', 'execute')::text || ' / '
                 || (has_function_privilege('anon', 'public.flat_blockers(text[])', 'execute') or has_function_privilege('authenticated', 'public.flat_blockers(text[])', 'execute'))::text), 'not found');
