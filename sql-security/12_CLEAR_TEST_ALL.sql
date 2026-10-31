-- 12 · CLEAR TEST DOCUMENTS clears all test activity, not only bills / receipts / letters   (Aakar, decided 31 Oct 2026)
-- Until now clear_test_documents() (BACKUP_RESTORE.sql) removed bills, receipts and letters. Before GO LIVE the
-- committee wants every test entry gone. This replaces the function (same name and inputs) so it also removes:
--   "I have paid" reports, letter requests, events (team, accounts, registrations, gate check-ins),
--   meetings / minutes / action points, complaints, common plot bookings, notices and banners,
--   AMC contracts and service visits, nominees and nomination status.
-- KEPT: flats and owners, family, vehicles, emergency contacts, flat documents, businesses, committee roles,
--   areas of responsibility, contacts, booking areas, letter templates, signatories / stamp, billing settings,
--   help guide, all logins, the old `maintenance` table (not used by the app; left as it is).
-- Numbers: bills / other bills / receipts / letters start after the numbers given (as before); complaint numbers
--   restart by themselves (CMP/26-27/0001), because they count the complaints that exist.
-- Files (event photos, minutes, complaint photos, notices, AMC copies, payment screenshots) are deleted by the app
--   (ADMIN → CLEAR TEST DOCUMENTS) after this function succeeds; the database does not touch storage.
-- Still refused after GO LIVE (society_live row), and only the server can run it. The app saves a backup first.
-- Run in Supabase > SQL Editor. Safe to re-run. No data is changed by running this script. Undo: 12_UNDO.sql.

create or replace function public.clear_test_documents(p_bill int, p_other int, p_rcpt int, p_letter int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text; n int; res jsonb := '{}'::jsonb;
  -- children before parents (several also cascade, but explicit order keeps the counts right)
  tabs text[] := array['payment_reports', 'payments', 'bills', 'letter_requests', 'letters',
                       'event_checkins', 'event_registrations', 'event_money', 'event_team',
                       'meeting_actions', 'meetings', 'events',
                       'complaints', 'bookings', 'notices',
                       'amc_visits', 'amc_contracts',
                       'nominees', 'nomination_status'];
begin
  if exists (select 1 from public.society_live) then raise exception 'The society is live. Test clearing is locked.'; end if;
  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where true', t);
      get diagnostics n = row_count;
      res := res || jsonb_build_object(t, n);
    end if;
  end loop;
  update public.billing_settings set bill_last_no = greatest(0, p_bill), other_last_no = greatest(0, p_other),
         rcpt_last_no = greatest(0, p_rcpt), updated_at = now() where id = 1;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'letter_last_no') then
    execute 'update public.billing_settings set letter_last_no = greatest(0, $1) where id = 1' using p_letter;
  end if;
  -- old names, still read by the app's message
  return res || jsonb_build_object('bills', coalesce((res->>'bills')::int, 0), 'receipts', coalesce((res->>'payments')::int, 0),
                                   'letters', coalesce((res->>'letters')::int, 0));
end $$;
revoke all on function public.clear_test_documents(int, int, int, int) from public, anon, authenticated;
grant execute on function public.clear_test_documents(int, int, int, int) to service_role;

-- Check: expect 1 row, clears_all = true, members_can_run = false, society_live 0 (still testing)
select 'clear_test_documents' as item,
  (pg_get_functiondef('public.clear_test_documents(int,int,int,int)'::regprocedure) like '%amc_contracts%')::text as clears_all,
  has_function_privilege('authenticated', 'public.clear_test_documents(int,int,int,int)'::regprocedure, 'execute')::text as members_can_run,
  (select count(*) from public.society_live)::text as society_live;
