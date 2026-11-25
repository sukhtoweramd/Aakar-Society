-- MT_13_UNDO.sql (Nov 2026) - puts the eight event actions back exactly as they were (from the copy MT_13 saved in zz_mt13_function_backup).
-- Run by hand in the Supabase SQL Editor. Safe to run again. Changes no table and no data. If a later script changed any of these functions again,
-- this puts them back to the text they had before MT_13 (so run it only when you mean to go back to before MT_13).
do $$
declare r record;
begin
  if to_regclass('public.zz_mt13_function_backup') is null then
    raise exception 'There is no saved copy (zz_mt13_function_backup): MT_13 was not run here. Nothing was changed.';
  end if;
  for r in select fn, def from public.zz_mt13_function_backup order by fn loop
    execute r.def;
  end loop;
end $$;

-- Check
select 'event actions back to the original, none names the login''s society (expect 0)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('my_event_role', 'gate_pass', 'gate_undo', 'register_for_event', 'set_event_money_settings', 'set_event_registration', 'submit_event_payment', 'verify_event_payment')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value;
