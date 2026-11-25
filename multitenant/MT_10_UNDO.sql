-- MT_10_UNDO.sql - puts the three directory views back exactly as they were before MT_10 (from the copy MT_10 saved in zz_mt10_view_backup).
-- Run by hand in the Supabase SQL Editor. Safe to run again. Stops with a message, changing nothing, if there is no saved copy.
do $$
declare r record;
begin
  if to_regclass('public.zz_mt10_view_backup') is null or (select count(*) from public.zz_mt10_view_backup) < 3 then
    raise exception 'There is no saved copy of the three views (zz_mt10_view_backup): MT_10 was not run here, or it is already undone and cleaned up.';
  end if;
  for r in select view_name, def, options from public.zz_mt10_view_backup order by view_name loop
    execute format('create or replace view public.%I %s as %s', r.view_name,
                   case when r.options <> '' then 'with (' || r.options || ')' else '' end,
                   regexp_replace(r.def, '[;\s]+$', ''));
  end loop;
  revoke all on public.flat_directory, public.member_directory, public.business_directory from anon, public;
end $$;

select 'the three views are back to their text from before MT_10 (expect NO / NO / NO)' as what,
  concat_ws(' / ',
    case when pg_get_viewdef('public.flat_directory'::regclass, true) ~ 'active_society' then 'yes' else 'NO' end,
    case when pg_get_viewdef('public.member_directory'::regclass, true) ~ 'active_society' then 'yes' else 'NO' end,
    case when pg_get_viewdef('public.business_directory'::regclass, true) ~ 'active_society' then 'yes' else 'NO' end) as value;
