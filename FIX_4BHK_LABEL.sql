-- FIX_4BHK_LABEL.sql · changes the typed BHK "4BK" to "4BHK" on flats (31 Oct 2026). Only the label; no amounts are touched.
-- Safe to run again.
update public.flats set bhk = '4BHK'   where upper(trim(bhk)) in ('4BK', '4 BK');
update public.flats set bhk = '4BHK+T' where upper(trim(bhk)) in ('4BK+T', '4 BK+T');

-- Check: both counts should be 0; the list shows every BHK label in use and how many flats have it
select 'flats still labelled 4BK (expect 0)' as item, count(*)::text as result from public.flats where upper(bhk) like '4BK%'
union all select 'BHK ' || coalesce(bhk, '(empty)'), count(*)::text from public.flats group by bhk;
