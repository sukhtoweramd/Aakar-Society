-- "I have paid" with screenshot reading: duplicate-reference check.
-- Run once in Supabase > SQL Editor (after PAYMENT_REPORTS.sql). Safe to run again. Changes no data.
-- A member learns only WHETHER a UTR / reference was already reported or received (and when), never by which flat.

create or replace function public.utr_already_reported(p_ref text)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (select regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g') as d)
  select case when length((select d from r)) < 6 then jsonb_build_object('found', false) else
    coalesce((
      select jsonb_build_object('found', true, 'on', min(t.on_date))
      from (
        select pr.reported_at::date as on_date from public.payment_reports pr
         where pr.status in ('pending', 'verified') and upper(regexp_replace(coalesce(pr.ref, ''), '[^A-Za-z0-9]', '', 'g')) = upper((select d from r))
        union all
        select p.paid_on from public.payments p
         where p.status = 'active' and upper(regexp_replace(coalesce(p.ref, ''), '[^A-Za-z0-9]', '', 'g')) = upper((select d from r))
      ) t having count(*) > 0), jsonb_build_object('found', false)) end
$$;
revoke all on function public.utr_already_reported(text) from public, anon;
grant execute on function public.utr_already_reported(text) to authenticated;

-- Check: should show functions | 1
select 'functions' as item, count(*)::text as value from pg_proc where proname = 'utr_already_reported';
