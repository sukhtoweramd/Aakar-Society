-- MT_17_UNDO.sql (Nov 2026) - puts back what MT_17 changed, exactly as it was (from the copies MT_17 saved in zz_mt17_function_backup and
-- zz_mt17_default_backup): current_society_or_first(), the three p_society functions, next_doc_numbers(), is_committee() and the 39 column defaults.
-- Run by hand in the Supabase SQL Editor. Safe to run again. Changes no data. If a later script changed any of these again, this puts them back to the text they had
-- before MT_17 (so run it only when you mean to go back to before MT_17).
do $$
declare r record; n int := 0;
begin
  if to_regclass('public.zz_mt17_function_backup') is null or to_regclass('public.zz_mt17_default_backup') is null then
    raise exception 'There is no saved copy (zz_mt17_*): MT_17 was not run here. Nothing was changed.';
  end if;
  -- the old function first (the defaults and the other functions use it)
  for r in select fn, def from public.zz_mt17_function_backup where fn = 'public.current_society_or_first()' loop execute r.def; end loop;
  for r in select tbl, col from public.zz_mt17_default_backup loop
    if to_regclass('public.' || quote_ident(r.tbl)) is not null then
      execute format('alter table public.%I alter column %I set default public.current_society_or_first()', r.tbl, r.col);
      n := n + 1;
    end if;
  end loop;
  for r in select fn, def from public.zz_mt17_function_backup where fn <> 'public.current_society_or_first()' order by fn loop execute r.def; end loop;
  drop function if exists public.require_society(uuid);
  raise notice '% column default(s) put back', n;
end $$;

-- Check
select 'old function is back (expect true)' as what, (to_regprocedure('public.current_society_or_first()') is not null)::text as value
union all select 'columns defaulting to the old function again (expect 39)',
       (select count(*) from pg_attrdef df join pg_class c on c.oid = df.adrelid
         where c.relnamespace = 'public'::regnamespace and pg_get_expr(df.adbin, df.adrelid) like '%current_society_or_first%')::text
union all select 'the 3 functions use the old fallback again (expect 3)',
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('clear_test_documents', 'flat_blockers', 'restore_society_backup')
           and pg_get_functiondef(p.oid) like '%current_society_or_first%')::text
union all select 'is_committee has its transition rule again (expect true)',
       (pg_get_functiondef('public.is_committee()'::regprocedure) ~* 'not\s+exists\s*\(\s*select\s+1\s+from\s+public\.society_memberships')::text;
