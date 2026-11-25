-- MT_13_TEST.sql (Nov 2026) - tries MT_13 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on Aakar's live database (it moves the
-- committee login to another society, turns it into a flat login for a moment, adds events, flats, registrations, passes and money rows; rolled back,
-- but there is no reason to do that where the data matters).
-- It gives a SECOND society an event, a registration, a pass and a check-in (and the same flat id A101), then acts as real "authenticated" database users:
--   part 1  the committee login of the first society tries to scan, undo, register, change, pay and confirm the OTHER society's event things;
--   part 2  the same login as a plain flat login (A101) of the first society, who must NOT inherit the role of the other society's A101;
--   part 3  the same login moved to the second society tries the same against the first;
--   part 4  a login with no society.
-- Each attempt must be refused or find nothing; its own society's things must still work (with the rows naming the right society).
-- Needs the first society to have flat A101 and one committee login (the sample data of the test project), and MT_13 run.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; n int; t text; tt text; code text; old_meta jsonb;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  ev_a uuid := gen_random_uuid(); ev_b uuid := gen_random_uuid();
  reg_b uuid; reg_a uuid; reg_a2 uuid; reg_a3 uuid; ck_b uuid := gen_random_uuid(); ck_a uuid; code_b text; code_a2 text; code_a3 text;
  sess constant jsonb := '[{"id":"s1","name":"Dinner","member_price":100,"guest_price":200,"ask_jain":false}]';
  fund_b numeric; reg_open_b boolean; upi_b text;
begin
  if pg_get_functiondef('public.my_event_role(uuid)'::regprocedure) !~ 'active_society' then raise exception 'MT_13 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then raise exception 'The first society needs flat A101 (load SAMPLE_DATA.sql).'; end if;
  select raw_app_meta_data into old_meta from auth.users where id = uid;

  -- act as the committee login from the start (the guards on flats and events refuse committee things from a login-less SQL Editor)
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  begin
    -- second society: the same flat id A101, an event, one registration (submitted, free pass), a check-in, A101 is the convenor of its event
    insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
    insert into public.flats (society_id, id, tower, floor, flat_no, owner_name) values (other, 'A101', 'A', 1, 'A101', 'ZZ OWNER 101');
    -- first society: two more flats, A101 gets a name (updated AFTER the second society's A101 was added, so a lookup by flat id alone would meet the other one first)
    insert into public.flats (society_id, id, tower, floor, flat_no, owner_name) values (aakar, 'ZZ01', 'A', 1, 'ZZ01', 'AAKAR ZZ01'), (aakar, 'ZZ02', 'A', 1, 'ZZ02', 'AAKAR ZZ02');
    update public.flats set owner_name = 'AAKAR OWNER' where society_id = aakar and id = 'A101';
    insert into public.events (society_id, id, title, pass_sessions, reg_open, fund_per_flat, pass_price, guest_pass_price, accounts_public)
      values (aakar, ev_a, 'ZZ EVENT A', sess, true, 10, 20, 30, false), (other, ev_b, 'ZZ EVENT B', sess, true, 11, 21, 31, false);
    insert into public.event_team (society_id, event_id, flat_id, role) values (aakar, ev_a, 'A101', 'Member'), (other, ev_b, 'A101', 'Convenor');
    insert into public.event_registrations (society_id, event_id, flat_id, counts, amount, pay_status, pay_mode, pay_amount, pay_date)
      values (other, ev_b, 'A101', '{"s1":{"mr":1,"mj":0,"gr":0,"gj":0}}', 0, 'submitted', 'UPI', 100, current_date) returning id, pass_code into reg_b, code_b;
    insert into public.event_registrations (society_id, event_id, flat_id, counts, amount) values (aakar, ev_a, 'ZZ02', '{"s1":{"mr":2,"mj":0,"gr":0,"gj":0}}', 0) returning id, pass_code into reg_a2, code_a2;
    insert into public.event_registrations (society_id, event_id, flat_id, counts, amount, pay_status, pay_mode, pay_amount, pay_date, cash_to)
      values (aakar, ev_a, 'ZZ01', '{"s1":{"mr":1,"mj":0,"gr":0,"gj":0}}', 100, 'submitted', 'Cash', 100, current_date, 'A101') returning id into reg_a3;
    insert into public.event_checkins (society_id, id, event_id, reg_id, flat_id, session_id, people, scanned_by) values (other, ck_b, ev_b, reg_b, 'A101', 's1', 1, 'zz');
  exception when others then
    raise exception 'MT_13_TEST setup failed: % (%)', sqlerrm, sqlstate;
  end;

  -- 1. the committee login of the FIRST society -----------------------------------------------------------------------------------------
  execute 'set local role authenticated';
  begin
    perform public.gate_pass('AKP1|' || reg_b || '|s1|' || code_b, 1);
    res := res || E'\n1 gate_pass with the SECOND society''s pass: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n1 gate_pass with the second society''s pass: refused "' || sqlerrm || '" (want Pass not valid (cancelled or changed). Ask the convenor.)';
    if sqlerrm is distinct from 'Pass not valid (cancelled or changed). Ask the convenor.' then ok := false; end if;
  end;
  begin
    perform public.gate_pass('AKP1|' || reg_a2 || '|s1|' || code_a2, 1);
    execute 'reset role';
    select society_id::text, id into t, ck_a from public.event_checkins where reg_id = reg_a2 limit 1;
    res := res || E'\n2 gate_pass with our own pass: let 1 in, the check-in belongs to ' || case when t = aakar::text then 'the first society' else coalesce(t, 'nobody') end || ' (want the first society)';
    if t is distinct from aakar::text then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n2 gate_pass with our own pass: ERROR ' || sqlerrm || ' (want in)  <-- WRONG'; ok := false;
  end;
  begin
    perform public.gate_undo(ck_b);
    res := res || E'\n3 gate_undo of the second society''s check-in: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n3 gate_undo of the second society''s check-in: refused "' || sqlerrm || '" (want Entry not found.)';
    if sqlerrm is distinct from 'Entry not found.' then ok := false; end if;
  end;
  begin
    perform public.gate_undo(ck_a);
    execute 'reset role';
    select count(*) into n from public.event_checkins where id in (ck_a, ck_b);
    res := res || E'\n4 gate_undo of our own check-in: done; check-ins left of the two: ' || n || ' (want 1: the second society''s)';
    if n <> 1 then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n4 gate_undo of our own check-in: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;
  begin
    perform public.register_for_event(ev_b, 'A101', '{"s1":{"mr":2}}');
    res := res || E'\n5 register_for_event for the SECOND society''s event: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n5 register_for_event for the second society''s event: refused "' || sqlerrm || '" (want Event not found.)';
    if sqlerrm is distinct from 'Event not found.' then ok := false; end if;
  end;
  begin
    perform public.register_for_event(ev_a, 'A101', '{"s1":{"mr":2}}');
    execute 'reset role';
    select id, society_id::text, amount::text into reg_a, t, tt from public.event_registrations where event_id = ev_a and flat_id = 'A101';
    res := res || E'\n6 register_for_event for our own event: made, belongs to ' || case when t = aakar::text then 'the first society' else coalesce(t, 'nobody') end || ' (want the first society), amount ' || coalesce(tt, 'none') || ' (want 200.00)';
    if t is distinct from aakar::text or tt is distinct from '200.00' then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n6 register_for_event for our own event: ERROR ' || sqlerrm || ' (want a registration)  <-- WRONG'; ok := false;
  end;
  begin
    perform public.set_event_registration(ev_b, sess, false, null, 'zz@upi', true);
    res := res || E'\n7 set_event_registration on the SECOND society''s event: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n7 set_event_registration on the second society''s event: refused "' || sqlerrm || '" (want Event not found.)';
    if sqlerrm is distinct from 'Event not found.' then ok := false; end if;
  end;
  begin
    perform public.set_event_money_settings(ev_b, 1, 2, 3, true);
    res := res || E'\n8 set_event_money_settings on the SECOND society''s event: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n8 set_event_money_settings on the second society''s event: refused "' || sqlerrm || '" (want Event not found.)';
    if sqlerrm is distinct from 'Event not found.' then ok := false; end if;
  end;
  begin
    perform public.set_event_registration(ev_a, sess, true, null, 'zz@upi', true);
    perform public.set_event_money_settings(ev_a, 1, 2, 3, true);
    execute 'reset role';
    select reg_upi, fund_per_flat::text into t, tt from public.events where id = ev_a;
    res := res || E'\n9 settings of our own event: UPI ' || coalesce(t, 'none') || ' (want zz@upi), fund ' || coalesce(tt, 'none') || ' (want 1)';
    if t is distinct from 'zz@upi' or tt is distinct from '1' then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n9 settings of our own event: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;
  begin
    perform public.submit_event_payment(reg_b, 'UPI', 100, current_date, 'ZZREF', null, null, null);
    res := res || E'\n10 submit_event_payment on the SECOND society''s registration: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n10 submit_event_payment on the second society''s registration: refused "' || sqlerrm || '" (want Registration not found.)';
    if sqlerrm is distinct from 'Registration not found.' then ok := false; end if;
  end;
  begin
    perform public.verify_event_payment(reg_b, true, null);
    res := res || E'\n11 verify_event_payment on the SECOND society''s registration: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n11 verify_event_payment on the second society''s registration: refused "' || sqlerrm || '" (want Registration not found.)';
    if sqlerrm is distinct from 'Registration not found.' then ok := false; end if;
  end;
  begin
    perform public.submit_event_payment(reg_a, 'UPI', 200, current_date, 'ZZREF', null, null, null);
    perform public.verify_event_payment(reg_a, true, null);
    perform public.verify_event_payment(reg_a3, true, null);
    execute 'reset role';
    select string_agg(distinct society_id::text, ',') into t from public.event_money where event_id = ev_a;
    select count(*) into n from public.event_money where society_id = other;
    select note into tt from public.event_money where event_id = ev_a and flat_id = 'ZZ01';
    res := res || E'\n12 our own payment sent and confirmed: money rows belong to ' || case when t = aakar::text then 'the first society' else coalesce(t, 'nobody') end || ' (want the first society), money rows of the second society ' || n || ' (want 0)';
    if t is distinct from aakar::text or n <> 0 then ok := false; end if;
    res := res || E'\n13 the cash taker in the note: "' || coalesce(left(tt, 40), 'none') || '" (want Cash received by AAKAR OWNER (A101)...)';
    if tt is null or tt not like 'Cash received by AAKAR OWNER (A101)%' then ok := false; end if;
    select pay_status into t from public.event_registrations where id = reg_b;
    res := res || E'\n14 the second society''s registration is still "' || t || '" (want submitted)';
    if t is distinct from 'submitted' then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n12-14 our own payment: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;
  execute 'reset role';
  select fund_per_flat, reg_open, reg_upi into fund_b, reg_open_b, upi_b from public.events where id = ev_b;
  res := res || E'\n15 the second society''s event is untouched: fund ' || fund_b || ' (want 11), registration open ' || reg_open_b || ' (want true), UPI ' || coalesce(upi_b, 'none') || ' (want none)';
  if fund_b <> 11 or reg_open_b is not true or upi_b is not null then ok := false; end if;

  -- 2. the same login as a plain FLAT login (A101) of the first society ----------------------------------------------------------------
  begin
    update auth.users set raw_app_meta_data = old_meta || jsonb_build_object('role', 'resident', 'flat_id', 'A101') where id = uid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'resident', 'flat_id', 'A101'))::text, true);
    execute 'set local role authenticated';
    t := coalesce(public.my_event_role(ev_a), 'none'); tt := coalesce(public.my_event_role(ev_b), 'none');
    res := res || E'\n16 flat login A101 of the first society: its role in its own event "' || t || '" (want Member), in the SECOND society''s event "' || tt || '" (want none: A101 there is another home)';
    if t <> 'Member' or tt <> 'none' then ok := false; end if;
    begin
      perform public.set_event_registration(ev_b, sess, false, null, 'zz@upi', true);
      res := res || E'\n17 flat login changes the second society''s event settings: ALLOWED (want refused)  <-- WRONG'; ok := false;
    exception when others then
      res := res || E'\n17 flat login changes the second society''s event settings: refused "' || sqlerrm || '" (want Only the committee or the event convenor can change this.)';
      if sqlerrm is distinct from 'Only the committee or the event convenor can change this.' then ok := false; end if;
    end;
    begin
      perform public.submit_event_payment(reg_b, 'UPI', 100, current_date, 'ZZREF', null, null, null);
      res := res || E'\n18 flat login A101 sends a payment on the second society''s A101 registration: ALLOWED (want refused)  <-- WRONG'; ok := false;
    exception when others then
      res := res || E'\n18 flat login A101 pays on the second society''s A101 registration: refused "' || sqlerrm || '" (want Registration not found.)';
      if sqlerrm is distinct from 'Registration not found.' then ok := false; end if;
    end;
    begin
      perform public.gate_pass('AKP1|' || reg_b || '|s1|' || code_b, 1);
      res := res || E'\n19 flat login A101 scans the second society''s pass: ALLOWED (want refused)  <-- WRONG'; ok := false;
    exception when others then
      res := res || E'\n19 flat login A101 scans the second society''s pass: refused "' || sqlerrm || '" (want Pass not valid (cancelled or changed). Ask the convenor.)';
      if sqlerrm is distinct from 'Pass not valid (cancelled or changed). Ask the convenor.' then ok := false; end if;
    end;
    execute 'reset role';
  exception when others then
    execute 'reset role';
    res := res || E'\n16-19 flat login part could not run: ' || sqlerrm || ' (auth.users not writable here? the other parts are still valid)'; ok := false;
  end;
  update auth.users set raw_app_meta_data = old_meta where id = uid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- 3. the same login, now in the SECOND society ----------------------------------------------------------------------------------------
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  begin
    perform public.gate_pass('AKP1|' || reg_a2 || '|s1|' || code_a2, 1);
    res := res || E'\n20 same login in the second society: gate_pass with the first society''s pass: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n20 same login in the second society: gate_pass with the first society''s pass: refused "' || sqlerrm || '" (want Pass not valid (cancelled or changed). Ask the convenor.)';
    if sqlerrm is distinct from 'Pass not valid (cancelled or changed). Ask the convenor.' then ok := false; end if;
  end;
  begin
    perform public.register_for_event(ev_a, 'A101', '{"s1":{"mr":1}}');
    res := res || E'\n21 register_for_event for the first society''s event: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n21 register_for_event for the first society''s event: refused "' || sqlerrm || '" (want Event not found.)';
    if sqlerrm is distinct from 'Event not found.' then ok := false; end if;
  end;
  begin
    perform public.set_event_money_settings(ev_a, 7, 8, 9, false);
    res := res || E'\n22 set_event_money_settings on the first society''s event: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n22 set_event_money_settings on the first society''s event: refused "' || sqlerrm || '" (want Event not found.)';
    if sqlerrm is distinct from 'Event not found.' then ok := false; end if;
  end;
  begin
    perform public.verify_event_payment(reg_a3, true, null);
    res := res || E'\n23 verify_event_payment on the first society''s registration: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n23 verify_event_payment on the first society''s registration: refused "' || sqlerrm || '" (want Registration not found.)';
    if sqlerrm is distinct from 'Registration not found.' then ok := false; end if;
  end;
  begin
    perform public.register_for_event(ev_b, 'A101', '{"s1":{"mr":3}}');
    execute 'reset role';
    select society_id::text into t from public.event_registrations where event_id = ev_b and flat_id = 'A101';
    select amount::text into tt from public.event_registrations where event_id = ev_b and flat_id = 'A101';
    res := res || E'\n24 register_for_event for the second society''s own event: made, belongs to ' || case when t = other::text then 'the second society' else coalesce(t, 'nobody') end || ' (want the second society), amount ' || tt || ' (want 300.00)';
    if t is distinct from other::text or tt is distinct from '300.00' then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n24 register_for_event for the second society''s own event: ERROR ' || sqlerrm || ' (want a registration)  <-- WRONG'; ok := false;
  end;
  execute 'reset role';

  -- 4. a login that belongs to NO society finds nothing ---------------------------------------------------------------------------------
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  n := 0;
  begin perform public.gate_pass('AKP1|' || reg_b || '|s1|' || code_b, 1); n := n + 1; exception when others then null; end;
  begin perform public.gate_undo(ck_b); n := n + 1; exception when others then null; end;
  begin perform public.register_for_event(ev_a, 'A101', '{"s1":{"mr":1}}'); n := n + 1; exception when others then null; end;
  begin perform public.set_event_registration(ev_a, sess, true, null, 'zz2@upi', true); n := n + 1; exception when others then null; end;
  begin perform public.set_event_money_settings(ev_a, 5, 5, 5, true); n := n + 1; exception when others then null; end;
  begin perform public.submit_event_payment(reg_a2, 'UPI', 100, current_date, 'ZZ', null, null, null); n := n + 1; exception when others then null; end;
  begin perform public.verify_event_payment(reg_b, true, null); n := n + 1; exception when others then null; end;
  res := res || E'\n25 login with no society: scan / undo / register / settings (2) / pay / confirm that went through: ' || n || ' (want 0)';
  if n <> 0 then ok := false; end if;
  execute 'reset role';

  res := res || E'\n26 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
