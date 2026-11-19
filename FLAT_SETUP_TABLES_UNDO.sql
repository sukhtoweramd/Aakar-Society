-- FLAT_SETUP_TABLES_UNDO.sql · removes the two setup tables (undo of FLAT_SETUP_TABLES.sql). Safe to run again.
-- Run sql-security/14_UNDO.sql FIRST (it puts the restore function back to its earlier list, without these tables).
-- Drops only society_profile, towers and the tower guard. The flats table and every other table are not touched.
-- Their content is lost; it can be filled again by FLAT_SETUP_TABLES.sql, which reads the same values.
-- If the app code that reads these tables is already live, it falls back to the values in the code.

drop table if exists public.towers;
drop table if exists public.society_profile;
drop function if exists public.towers_guard();

-- Check: expect 0 and false
select count(*) as "setup tables left (expect 0)"
  from pg_class where relnamespace = 'public'::regnamespace and relname in ('society_profile', 'towers');
select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'towers_guard') > 0 as "tower guard left (expect false)";
