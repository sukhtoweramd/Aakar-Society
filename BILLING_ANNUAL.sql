-- Annual maintenance rates, half-yearly bills, rented flats at 1.5× (decided 30 Oct 2026). Safe to re-run.
--   • flats.maintenance now means the ANNUAL rate (set in ADMIN → charges, "MAINT ₹ / YEAR").
--     A half-yearly bill = annual ÷ 2. A rented flat (occupancy = tenant) gets a second line:
--     (multiplier − 1) × that amount, on standard maintenance only. The bill stays in the owner's name.
--   • This script only adds the multiplier setting (BILLING → SETTINGS → RENTED FLAT MULTIPLIER, default 1.5).
--     It does NOT change any flat's rate and does NOT touch bills: the committee re-enters the annual rates in
--     ADMIN → charges and deals with the existing test bill (see the check below).
-- Run in Supabase → SQL Editor after the PR "annual rates, half-yearly bills" is merged.

alter table public.billing_settings add column if not exists rent_multiplier numeric(4,2) not null default 1.5;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_rent_multiplier_check') then
    alter table public.billing_settings add constraint billing_settings_rent_multiplier_check check (rent_multiplier between 1 and 5);
  end if;
end $$;

-- Check (expected): multiplier 1.50 • the rates now stored per category (to compare with the annual amounts) •
--                   active maintenance bills made under the old monthly rule (correct, cancel or delete them)
select 'rent multiplier' as item, rent_multiplier::text as value from public.billing_settings where id = 1
union all
select 'rates stored (maintenance → flats)', string_agg(m || ' → ' || n, ', ' order by m) from (select maintenance::text as m, count(*)::text as n from public.flats group by maintenance) x
union all
select 'active maintenance bills', count(*)::text || coalesce(' (' || string_agg(bill_no || ' ' || flat_id || ' ₹' || amount, ', ') || ')', '') from public.bills where kind = 'maintenance' and status = 'active';
