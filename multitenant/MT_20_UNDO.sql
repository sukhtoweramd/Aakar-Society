-- MT_20_UNDO.sql (27 Nov 2026) - removes the two columns of MT_20.
-- WARNING: this deletes every society's saved stamp design and paper background (they can be chosen / uploaded again). Safe to run again.
alter table public.billing_settings drop constraint if exists billing_settings_stamp_design_shape;
alter table public.billing_settings drop constraint if exists billing_settings_bg_size;
alter table public.billing_settings drop column if exists stamp_design;
alter table public.billing_settings drop column if exists print_background;
select 'columns gone (expect false)' as what, (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name in ('stamp_design', 'print_background')))::text as value;
