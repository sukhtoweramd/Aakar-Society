-- MT_20 (27 Nov 2026) - stamp designer and paper background for every society. Run by hand in the Supabase SQL Editor, AFTER MT_19 (any time after MT_06).
-- Try it on the test project ("aanganone") first, live after a fresh backup. Safe to run again. Undo: MT_20_UNDO.sql.
--   billing_settings.stamp_design     - the choices of the stamp designer (colour, middle of the stamp, ring text, city, founding year) as a small JSON object.
--                                       Empty (null) = the built-in round blue stamp, exactly as before. The database refuses anything that is not a small object.
--   billing_settings.print_background - the society's own faint picture behind bills, receipts, letters and notices, kept as a data URL text
--                                       (the app squeezes it to about 150 000 characters; the database refuses over 250 000). Empty (null) = the default:
--                                       the first society keeps its building picture, every other society prints plain.
-- Who may change them is already decided by the table rules of billing_settings; nothing new to grant. Backup / restore carry both columns by themselves (whole rows).

alter table public.billing_settings add column if not exists stamp_design jsonb;
alter table public.billing_settings add column if not exists print_background text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_stamp_design_shape' and conrelid = 'public.billing_settings'::regclass) then
    alter table public.billing_settings add constraint billing_settings_stamp_design_shape
      check (stamp_design is null or (jsonb_typeof(stamp_design) = 'object' and length(stamp_design::text) <= 2000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_bg_size' and conrelid = 'public.billing_settings'::regclass) then
    alter table public.billing_settings add constraint billing_settings_bg_size check (print_background is null or length(print_background) <= 250000);
  end if;
end $$;

-- Check: both columns and both limits exist.
select 'stamp_design column exists (expect true)' as what, (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'stamp_design'))::text as value
union all select 'print_background column exists (expect true)', (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'print_background'))::text
union all select 'both limits exist (expect true)', (exists (select 1 from pg_constraint where conname = 'billing_settings_stamp_design_shape') and exists (select 1 from pg_constraint where conname = 'billing_settings_bg_size'))::text
union all select 'Aakar-style default kept: no society has a design or background yet (expect 0 on a fresh run)', (select count(*) from public.billing_settings where stamp_design is not null or print_background is not null)::text;
