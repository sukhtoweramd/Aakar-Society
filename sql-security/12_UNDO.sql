-- 12 UNDO · back to the BACKUP_RESTORE.sql version: CLEAR TEST DOCUMENTS removes only bills, receipts and letters.
-- Run in Supabase > SQL Editor. Safe to re-run. No data is changed.

create or replace function public.clear_test_documents(p_bill int, p_other int, p_rcpt int, p_letter int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nb int; np int; nl int := 0;
begin
  if exists (select 1 from public.society_live) then raise exception 'The society is live. Test clearing is locked.'; end if;
  delete from public.payments where true; get diagnostics np = row_count;
  delete from public.bills where true;    get diagnostics nb = row_count;
  if to_regclass('public.letters') is not null then
    execute 'delete from public.letters where true'; get diagnostics nl = row_count;
  end if;
  update public.billing_settings set bill_last_no = greatest(0, p_bill), other_last_no = greatest(0, p_other),
         rcpt_last_no = greatest(0, p_rcpt), updated_at = now() where id = 1;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'letter_last_no') then
    execute 'update public.billing_settings set letter_last_no = greatest(0, $1) where id = 1' using p_letter;
  end if;
  return jsonb_build_object('bills', nb, 'receipts', np, 'letters', nl);
end $$;
revoke all on function public.clear_test_documents(int, int, int, int) from public, anon, authenticated;
grant execute on function public.clear_test_documents(int, int, int, int) to service_role;

-- Check: expect clears_all = false
select 'clear_test_documents' as item, (pg_get_functiondef('public.clear_test_documents(int,int,int,int)'::regprocedure) like '%amc_contracts%')::text as clears_all;
