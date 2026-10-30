-- UNDO of BILLING_ANNUAL.sql: removes the rented-flat multiplier setting (the app then uses 1.5).
alter table public.billing_settings drop constraint if exists billing_settings_rent_multiplier_check;
alter table public.billing_settings drop column if exists rent_multiplier;
select 'rent_multiplier column' as item, count(*)::text as value from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'rent_multiplier';
