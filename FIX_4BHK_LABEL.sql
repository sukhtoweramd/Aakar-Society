-- FIX_4BHK_LABEL.sql · changes the typed BHK "4BK" to "4BHK" on flats (31 Oct 2026). Only the label; no amounts are touched.
-- Safe to run again.
-- The flat guard only lets a committee login change BHK, and the SQL Editor is not a login, so the guard is switched off
-- for these two updates and straight back on (as SPLIT_B101_B102.sql does).
alter table public.flats disable trigger flats_resident_guard;
update public.flats set bhk = '4BHK'   where upper(trim(bhk)) in ('4BK', '4 BK');
update public.flats set bhk = '4BHK+T' where upper(trim(bhk)) in ('4BK+T', '4 BK+T');
alter table public.flats enable trigger flats_resident_guard;

-- Check: guard is on, no 4BK left, and every BHK label in use with its number of flats
select 'flat guard switched on (expect true)' as item, (select tgenabled <> 'D' from pg_trigger where tgname = 'flats_resident_guard' and tgrelid = 'public.flats'::regclass)::text as result
union all select 'flats still labelled 4BK (expect 0)', count(*)::text from public.flats where upper(bhk) like '4BK%'
union all select 'BHK ' || coalesce(bhk, '(empty)'), count(*)::text from public.flats group by bhk;
