-- KEEPALIVE_UNDO.sql · removes the keep-alive function (undo of KEEPALIVE.sql). Safe to run again.
-- Drops only public.keepalive(). Nothing else uses it; no table, view, rule, permission or data is touched.
-- After this the GitHub keep-alive job will fail visibly (404) until KEEPALIVE.sql is run again or the job is switched off.

drop function if exists public.keepalive();

notify pgrst, 'reload schema';

-- Check: expect 0
select count(*) as "keepalive functions left (expect 0)"
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'keepalive';
