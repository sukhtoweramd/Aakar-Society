-- MT_16_UNDO.sql (Nov 2026) - removes the two login-page functions of MT_16. Safe to run again. Changes no table and no data.
-- (The app falls back to "no society word" when they are missing, so the login page keeps working as before.)
drop function if exists public.society_public(text);
drop function if exists public.my_society();
select 'MT_16 functions left (expect 0)' as what,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('society_public', 'my_society'))::text as value;
