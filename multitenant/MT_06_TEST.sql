-- MT_06_TEST.sql (Nov 2026) - tries MT_06 on the TEST project only ("aanganone"). Never on Aakar's live database.
-- Gives a second society its own billing_settings row, then, as a real committee login, reserves numbers: first as committee of the first
-- society, then (membership moved) as committee of the second. Each must move ONLY its own counter. Ends with a deliberate error so
-- EVERYTHING is rolled back (the red error is expected; read the lines after "RESULT:"). Safe to run any number of times.
do $$
declare
  uid uuid; res text := ''; n int; ok boolean := true;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  a0 int; o0 int; a1 int; o1 int; a2 int; o2 int;
begin
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  insert into public.billing_settings (society_id, id) values (other, 1);
  res := res || E'\n1 a second society has its own billing row     : allowed   (want allowed)';
  begin
    insert into public.billing_settings (society_id, id) values (other, 1);
    res := res || E'\n2 a second row for the same society             : allowed   (want refused)  <-- WRONG'; ok := false;
  exception when unique_violation then
    res := res || E'\n2 a second row for the same society             : refused   (want refused)';
  end;
  select bill_last_no into a0 from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into o0 from public.billing_settings where society_id = other and id = 1;

  execute 'set local role authenticated';
  perform * from public.next_doc_numbers('bill', 3);                 -- as committee of the FIRST society
  execute 'reset role';
  select bill_last_no into a1 from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into o1 from public.billing_settings where society_id = other and id = 1;
  res := res || E'\n3 committee of the first society reserves 3     : first society ' || a0 || ' -> ' || a1 || ', second society ' || o0 || ' -> ' || o1 || '   (want +3 and +0)';
  if a1 <> a0 + 3 or o1 <> o0 then ok := false; end if;

  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  perform * from public.next_doc_numbers('bill', 5);                 -- as committee of the SECOND society
  execute 'reset role';
  select bill_last_no into a2 from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into o2 from public.billing_settings where society_id = other and id = 1;
  res := res || E'\n4 committee of the second society reserves 5    : first society ' || a1 || ' -> ' || a2 || ', second society ' || o1 || ' -> ' || o2 || '   (want +0 and +5)';
  if a2 <> a1 or o2 <> o1 + 5 then ok := false; end if;

  res := res || E'\n5 overall                                       : ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT:%\n(everything above was rolled back; this red error is expected)', res;
end $$;
