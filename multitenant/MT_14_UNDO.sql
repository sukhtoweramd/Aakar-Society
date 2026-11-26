-- MT_14_UNDO.sql (Nov 2026) - puts the eight complaint / letter / meeting / payment-reference actions back exactly as they were (from the copy MT_14 saved in zz_mt14_function_backup).
-- Run by hand in the Supabase SQL Editor. Safe to run again. Changes no table and no data. If a later script changed any of these functions again,
-- this puts them back to the text they had before MT_14 (so run it only when you mean to go back to before MT_14).
do $$
declare r record;
begin
  if to_regclass('public.zz_mt14_function_backup') is null then
    raise exception 'There is no saved copy (zz_mt14_function_backup): MT_14 was not run here. Nothing was changed.';
  end if;
  for r in select fn, def from public.zz_mt14_function_backup order by fn loop
    execute r.def;
  end loop;
end $$;

-- Check
select 'actions back to the original, none names the login''s society (expect 0)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('mark_my_action_done', 'my_action_points', 'my_committee_meetings', 'my_meeting', 'reassign_complaint', 'update_complaint', 'utr_already_reported', 'withdraw_letter_request')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value;
