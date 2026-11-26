-- MT_15_UNDO.sql (Nov 2026) - puts the three trigger functions back exactly as they were (from the copy MT_15 saved in zz_mt15_function_backup).
-- Run by hand in the Supabase SQL Editor. Safe to run again. Changes no table and no data. If a later script changed any of these functions again,
-- this puts them back to the text they had before MT_15 (so run it only when you mean to go back to before MT_15).
do $$
declare r record;
begin
  if to_regclass('public.zz_mt15_function_backup') is null then
    raise exception 'There is no saved copy (zz_mt15_function_backup): MT_15 was not run here. Nothing was changed.';
  end if;
  for r in select fn, def from public.zz_mt15_function_backup order by fn loop
    execute r.def;
  end loop;
end $$;

-- Check
select 'trigger functions back to the original, none names the row''s society (expect 0)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('tenant_moved_out', 'committee_areas_guard', 'letter_request_before_insert')
           and pg_get_functiondef(p.oid) ~ 'new\.society_id')::text as value;
