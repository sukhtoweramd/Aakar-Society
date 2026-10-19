-- Stops a flat being given two maintenance bills for the same period.
-- Run once in Supabase > SQL Editor. Safe to run again. It does NOT change or delete any existing data.
-- If duplicates already exist (e.g. from testing), it lists them and does not add the rule:
-- cancel or delete the extra bill(s) in the app, then run this again.

-- 1. Any existing duplicates? (active maintenance bills, same flat, same period start)
select flat_id, period_from, count(*) as bills, string_agg(bill_no, ', ' order by bill_no) as bill_numbers
from public.bills
where kind = 'maintenance' and status = 'active'
group by flat_id, period_from
having count(*) > 1
order by flat_id;

-- 2. Add the rule only when there are no duplicates
do $$
begin
  if exists (
    select 1 from public.bills where kind = 'maintenance' and status = 'active'
    group by flat_id, period_from having count(*) > 1
  ) then
    raise notice 'Duplicates found (listed above). Cancel or delete the extra bills in the app, then run this script again.';
  else
    create unique index if not exists bills_one_maintenance_per_period
      on public.bills (flat_id, period_from)
      where kind = 'maintenance' and status = 'active';
    raise notice 'Done: one active maintenance bill per flat per period is now enforced.';
  end if;
end $$;

-- 3. Check: shows 1 when the rule is in place
select count(*) as rule_in_place from pg_indexes
where schemaname = 'public' and indexname = 'bills_one_maintenance_per_period';
