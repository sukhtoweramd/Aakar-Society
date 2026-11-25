-- MT_12_UNDO.sql (Nov 2026) - puts the five booking actions back exactly as they were (from the copy MT_12 saved in zz_mt12_function_backup).
-- Run by hand in the Supabase SQL Editor. Safe to run again. Changes no table and no data. If a later script changed any of these functions again,
-- this puts them back to the text they had before MT_12 (so run it only when you mean to go back to before MT_12).
do $$
declare r record;
begin
  if to_regclass('public.zz_mt12_function_backup') is null then
    raise exception 'There is no saved copy (zz_mt12_function_backup): MT_12 was not run here. Nothing was changed.';
  end if;
  for r in select fn, def from public.zz_mt12_function_backup order by fn loop
    execute r.def;
  end loop;
end $$;

-- Check
select 'booking actions back to the original, none names the login''s society (expect 0)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('booked_slots', 'cancel_booking', 'decide_booking', 'request_booking', 'set_booking_charge')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value
union all select 'decide_booking has its temporary fallback again (expect yes)',
       case when pg_get_functiondef('public.decide_booking(uuid,boolean,text)'::regprocedure) ~* 'current_society_or_first' then 'yes' else 'NO' end;
