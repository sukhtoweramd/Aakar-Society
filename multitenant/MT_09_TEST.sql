-- MT_09_TEST.sql (Nov 2026) - tries MT_09 on the TEST project only ("aanganone"). NEVER on Aakar's live database: it calls
-- clear_test_documents for Aakar's society, which really deletes Aakar's bills / receipts / letters inside the test (everything is rolled
-- back at the end, but do not run it where the data matters).
-- Gives a second society a flat, a letter and its own bill counters, then checks that clearing / restoring ONE society leaves the other
-- one's rows and counters alone, that the 4-argument call still means Aakar, that a live society is locked, and that members cannot run
-- the functions. Ends with a deliberate error so EVERYTHING is rolled back (the red error is expected; read the lines after "RESULT:").
do $$
declare
  res text := ''; ok boolean := true; n int; n2 int; r jsonb; c1 int; c2 int; c3 int;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  if to_regprocedure('public.clear_test_documents(integer,integer,integer,integer,uuid)') is null
     or to_regprocedure('public.restore_society_backup(jsonb,uuid)') is null then
    raise exception 'MT_09 has not been run here yet.';
  end if;
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then raise exception 'The first society has no flat A101 here (load SAMPLE_DATA.sql).'; end if;
  if exists (select 1 from public.society_live) then raise exception 'A society is live here: the test cannot run (it needs test clearing to be open).'; end if;

  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  insert into public.flats (society_id, id) values (other, 'A101');
  insert into public.billing_settings (society_id, id) values (other, 1) on conflict do nothing;
  update public.billing_settings set bill_last_no = 5, other_last_no = 6, rcpt_last_no = 7 where society_id = other and id = 1;
  select bill_last_no into c1 from public.billing_settings where society_id = aakar and id = 1;

  -- 1. clear the SECOND society: the first society's rows and counters stay
  insert into public.letters (society_id, ref_no, flat_id, letter_date, subject, body) values (aakar, 'MT09-AAKAR', 'A101', current_date, 's', 'b');
  insert into public.letters (society_id, ref_no, flat_id, letter_date, subject, body) values (other, 'MT09-OTHER', 'A101', current_date, 's', 'b');
  r := public.clear_test_documents(0, 0, 0, 0, other);
  select count(*) into n from public.letters where society_id = aakar and ref_no = 'MT09-AAKAR';
  select count(*) into n2 from public.letters where society_id = other;
  res := res || E'\n1 clear the second society: first society''s letter kept ' || n || ' (want 1), second society''s letters left ' || n2 || ' (want 0)';
  if n <> 1 or n2 <> 0 then ok := false; end if;
  select bill_last_no into c2 from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into c3 from public.billing_settings where society_id = other and id = 1;
  res := res || E'\n2 counters: first society unchanged ' || (c1 is not distinct from c2) || ' (want true), second society reset to ' || c3 || ' (want 0)';
  if c1 is distinct from c2 or c3 <> 0 then ok := false; end if;

  -- 2. the 4-argument call still means the first society
  insert into public.letters (society_id, ref_no, flat_id, letter_date, subject, body) values (other, 'MT09-OTHER2', 'A101', current_date, 's', 'b');
  r := public.clear_test_documents(0, 0, 0, 0);
  select count(*) into n from public.letters where society_id = aakar;
  select count(*) into n2 from public.letters where society_id = other and ref_no = 'MT09-OTHER2';
  res := res || E'\n3 4-argument call: first society''s letters left ' || n || ' (want 0), second society''s letter kept ' || n2 || ' (want 1)';
  if n <> 0 or n2 <> 1 then ok := false; end if;

  -- 3. the lock is per society
  insert into public.society_live (society_id, id) values (other, 1);
  begin
    r := public.clear_test_documents(0, 0, 0, 0, other);
    res := res || E'\n4 clearing a LIVE society: allowed (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n4 clearing a LIVE society: refused (want refused)';
  end;
  begin
    r := public.clear_test_documents(0, 0, 0, 0, aakar);
    res := res || E'\n5 the first society is not live, so it can still be cleared while the second is live: allowed (want allowed)';
  exception when others then
    res := res || E'\n5 first society cleared while the second is live: REFUSED (' || sqlerrm || ') (want allowed)  <-- WRONG'; ok := false;
  end;
  delete from public.society_live where society_id = other;

  -- 4. restore into the second society from a file whose rows claim to belong to the FIRST society
  select count(*) into c1 from public.flats where society_id = aakar;
  insert into public.letters (society_id, ref_no, flat_id, letter_date, subject, body) values (other, 'MT09-OTHER3', 'A101', current_date, 's', 'b');
  r := public.restore_society_backup(jsonb_build_object('app', 'aakar-society', 'tables', jsonb_build_object(
         'flats', jsonb_build_array(jsonb_build_object('id', 'Z999', 'society_id', aakar::text)),
         'letters', '[]'::jsonb)), other);
  select count(*) into n from public.flats where society_id = aakar;
  select count(*) into n2 from public.flats where society_id = other and id = 'Z999';
  select count(*) into c2 from public.flats where society_id = other and id = 'A101';
  res := res || E'\n6 restore into the second society: first society''s flats ' || n || ' of ' || c1 || ' (want equal), restored flat Z999 in the second society ' || n2 || ' (want 1), its old A101 gone ' || (c2 = 0) || ' (want true)';
  if n <> c1 or n2 <> 1 or c2 <> 0 then ok := false; end if;
  select count(*) into n from public.flats where society_id = aakar and id = 'Z999';
  select count(*) into n2 from public.letters where society_id = other;
  res := res || E'\n7 the society_id written in the file was ignored: Z999 in the first society ' || n || ' (want 0); second society''s letters after restore ' || n2 || ' (want 0)';
  if n <> 0 or n2 <> 0 then ok := false; end if;

  -- 5. members cannot run them
  begin
    execute 'set local role authenticated';
    perform public.clear_test_documents(0, 0, 0, 0, other);
    res := res || E'\n8 a member can run clear_test_documents: yes (want no)  <-- WRONG'; ok := false;
  exception when insufficient_privilege then
    res := res || E'\n8 a member can run clear_test_documents: no (want no)';
  end;
  execute 'reset role';

  res := res || E'\n9 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
