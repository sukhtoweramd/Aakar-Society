-- ADMIN → STORAGE USED: database size and the biggest tables (committee only). Changes no data.
-- Run once in Supabase > SQL Editor. Safe to run again.

create or replace function public.storage_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_committee() then raise exception 'Only the committee can see storage use.'; end if;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', pg_total_relation_size(t.relid), 'rows', t.n_live_tup) order by pg_total_relation_size(t.relid) desc)
      from pg_stat_user_tables t where t.schemaname = 'public'), '[]'::jsonb));
end $$;
revoke all on function public.storage_stats() from public, anon;
grant execute on function public.storage_stats() to authenticated;

-- Check: should show functions | 1
select 'functions' as item, count(*)::text as value from pg_proc where proname = 'storage_stats';
