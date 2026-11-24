-- Undo of MT_09_BACKUP_CLEAR_SCOPE.sql: clear_test_documents and restore_society_backup exactly as they were before MT_09
-- (from the copy MT_09 saved in zz_mt09_function_backup). Stops with a message if that copy is missing; changes nothing then.
do $$
declare
  d text;
begin
  if to_regclass('public.zz_mt09_function_backup') is null then raise exception 'zz_mt09_function_backup is missing: MT_09 was not run here, or the copy was removed.'; end if;

  select def into d from public.zz_mt09_function_backup where fn = 'clear_test_documents';
  if d is not null then
    drop function if exists public.clear_test_documents(integer, integer, integer, integer, uuid);
    execute d;
    revoke all on function public.clear_test_documents(integer, integer, integer, integer) from public, anon, authenticated;
    grant execute on function public.clear_test_documents(integer, integer, integer, integer) to service_role;
  end if;

  select def into d from public.zz_mt09_function_backup where fn = 'restore_society_backup';
  if d is not null then
    drop function if exists public.restore_society_backup(jsonb, uuid);
    execute d;
    revoke all on function public.restore_society_backup(jsonb) from public, anon, authenticated;
    grant execute on function public.restore_society_backup(jsonb) to service_role;
  end if;
end $$;

-- The saved copy stays (harmless); drop it by hand with "drop table public.zz_mt09_function_backup;" once you are sure.
select 'clear_test_documents back to 4 arguments (expect yes)' as what,
  case when to_regprocedure('public.clear_test_documents(integer,integer,integer,integer)') is not null
        and to_regprocedure('public.clear_test_documents(integer,integer,integer,integer,uuid)') is null then 'yes' else 'NO' end as value
union all select 'restore_society_backup back to 1 argument (expect yes)',
  case when to_regprocedure('public.restore_society_backup(jsonb)') is not null
        and to_regprocedure('public.restore_society_backup(jsonb,uuid)') is null then 'yes' else 'NO' end;
