-- MT_12_TEST.sql (Nov 2026) - tries MT_12 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on Aakar's live database (it moves the
-- committee login to another society, edits areas and flats, approves a booking and makes a notice and a bill; rolled back, but there is no reason
-- to do that where the data matters).
-- It gives a SECOND society an area, bookings and the same flat id (A101), then acts as the first committee login (a real "authenticated" database user)
-- and tries to read, book, cancel, approve and price the OTHER society's things through the five booking actions; then the same login moves to the
-- second society and tries the same against the first; then a login with no society tries. Each attempt must be refused or find nothing.
-- Needs the first society to have flat A101 and one committee login (the sample data of the test project).
do $$
declare
  uid uuid; res text := ''; ok boolean := true; n int; n2 int; t text; g1 uuid; nid text;
  d date := public.booking_today() + 30;
  area_a uuid; area_b uuid; gb1 uuid := gen_random_uuid(); gb2 uuid := gen_random_uuid(); ga2 uuid := gen_random_uuid();
  cnt_a0 int; cnt_b0 int; cnt_a1 int; cnt_b1 int; exp_a int; ch numeric;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  if pg_get_functiondef('public.booked_slots(date,date)'::regprocedure) !~ 'active_society' then raise exception 'MT_12 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then raise exception 'The first society needs flat A101 (load SAMPLE_DATA.sql).'; end if;

  -- act as the committee login from the start (the guards on flats and bookings refuse committee things from a login-less SQL Editor)
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- first society: nobody is Chairman / Secretary (so this committee login may approve), ONE active area priced 100
  update public.flats set committee_role = null where society_id = aakar and committee_role ~* '(chair|secretary)';
  select id into area_a from public.booking_areas where society_id = aakar and active order by sort, name limit 1;
  if area_a is null then insert into public.booking_areas (society_id, name, charge) values (aakar, 'ZZ AAKAR AREA', 100) returning id into area_a; end if;
  update public.booking_areas set active = false where society_id = aakar and id <> area_a;
  update public.booking_areas set charge = 100, active = true where id = area_a;
  insert into public.billing_settings (society_id, id) values (aakar, 1) on conflict (society_id, id) do nothing;
  insert into public.booking_areas (society_id, name, charge) values (aakar, 'ZZ AAKAR PENDING AREA', 0) returning id into g1;   -- an inactive extra area is not needed; removed again below
  delete from public.booking_areas where id = g1;
  -- second society: the same flat id, an area priced 500, an approved and a pending booking, its own billing counters
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  insert into public.flats (society_id, id, tower, floor, flat_no, owner_name) values (other, 'A101', 'A', 1, 'A101', 'ZZ OWNER 101');
  insert into public.booking_areas (society_id, name, charge) values (other, 'ZZ OTHER AREA', 500) returning id into area_b;
  insert into public.billing_settings (society_id, id) values (other, 1) on conflict (society_id, id) do nothing;
  insert into public.bookings (society_id, group_id, flat_id, area_id, area_name, book_date, slot, status, created_by, charge, booked_by, bill_name, free_event)
    values (other, gb1, 'A101', area_b, 'ZZ OTHER AREA', d, 'day', 'approved', 'zz', 0, 'owner', 'ZZ', false),
           (other, gb2, 'A101', area_b, 'ZZ OTHER AREA', d + 1, 'day', 'pending', 'zz', 500, 'owner', 'ZZ', false);
  -- the first society's own pending request (used in part 2)
  insert into public.bookings (society_id, group_id, flat_id, area_id, area_name, book_date, slot, status, created_by, charge, booked_by, bill_name, free_event)
    values (aakar, ga2, 'A101', area_a, 'ZZ AAKAR AREA', public.booking_today() + 10, 'day', 'pending', 'zz', 100, 'owner', 'ZZ', false);
  select other_last_no into cnt_a0 from public.billing_settings where society_id = aakar and id = 1;
  select other_last_no into cnt_b0 from public.billing_settings where society_id = other and id = 1;
  select count(*) into exp_a from public.bookings where society_id = aakar and status in ('pending', 'approved') and book_date between public.booking_today() - 1 and public.booking_today() + 60;

  -- 1. the committee login of the FIRST society -----------------------------------------------------------------------------------------
  execute 'set local role authenticated';
  select count(*) into n from public.booked_slots(public.booking_today() - 1, public.booking_today() + 60);
  select count(*) into n2 from public.booked_slots(public.booking_today() - 1, public.booking_today() + 60) where area_id = area_b;
  res := res || E'\n1 first society: booked_slots ' || n || ' row(s) (want ' || exp_a || '), of the second society ' || n2 || ' (want 0)';
  if n <> exp_a or n2 <> 0 then ok := false; end if;
  begin
    perform public.request_booking('A101', array[area_b], d + 40, 'day', 'zz', false);
    res := res || E'\n2 request_booking for the SECOND society''s area: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n2 request_booking for the second society''s area: refused "' || sqlerrm || '" (want Area not available.)';
    if sqlerrm is distinct from 'Area not available.' then ok := false; end if;
  end;
  begin
    g1 := public.request_booking('A101', array[area_a], d + 41, 'day', 'zz test', false);
    execute 'reset role';
    select society_id::text into t from public.bookings where group_id = g1 limit 1;
    res := res || E'\n3 request_booking for our own area: made, the booking belongs to ' || case when t = aakar::text then 'the first society' else coalesce(t, 'null') end || ' (want the first society)';
    if t is distinct from aakar::text then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n3 request_booking for our own area: ERROR ' || sqlerrm || ' (want a booking)  <-- WRONG'; ok := false;
  end;
  begin
    perform public.cancel_booking(gb1, 'zz');
    res := res || E'\n4 cancel_booking of the second society''s booking: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n4 cancel_booking of the second society''s booking: refused "' || sqlerrm || '" (want Nothing to cancel.)';
    if sqlerrm is distinct from 'Nothing to cancel.' then ok := false; end if;
  end;
  begin
    perform public.decide_booking(gb2, true, null);
    res := res || E'\n5 decide_booking of the second society''s request: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n5 decide_booking of the second society''s request: refused "' || sqlerrm || '" (want This request is not waiting for approval.)';
    if sqlerrm is distinct from 'This request is not waiting for approval.' then ok := false; end if;
  end;
  begin
    nid := public.decide_booking(g1, true, null);
    execute 'reset role';
    select title into t from public.notices where id::text = nid and society_id = aakar;
    select other_last_no into cnt_a1 from public.billing_settings where society_id = aakar and id = 1;
    select other_last_no into cnt_b1 from public.billing_settings where society_id = other and id = 1;
    res := res || E'\n6 decide_booking of our own request: approved; notice of the first society "' || coalesce(left(t, 24), 'none') || '" (want All areas booked...: we have one active area)';
    if t is null or t not like 'All areas booked%' then ok := false; end if;
    res := res || E'\n7 bill counters: first society ' || cnt_a0 || ' -> ' || cnt_a1 || ' (want +1), second society ' || cnt_b0 || ' -> ' || cnt_b1 || ' (want unchanged)';
    if cnt_a1 <> cnt_a0 + 1 or cnt_b1 <> cnt_b0 then ok := false; end if;
    select b.society_id::text into t from public.bills b join public.bookings k on k.bill_id = b.id where k.group_id = g1 limit 1;
    res := res || E'\n8 the bill made for it belongs to ' || case when t = aakar::text then 'the first society' else coalesce(t, 'no bill') end || ' (want the first society)';
    if t is distinct from aakar::text then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n6-8 decide_booking of our own request: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;
  begin
    perform public.set_booking_charge(area_b, 777);
    res := res || E'\n9 set_booking_charge on the second society''s area: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n9 set_booking_charge on the second society''s area: refused "' || sqlerrm || '" (want Area not found.)';
    if sqlerrm is distinct from 'Area not found.' then ok := false; end if;
  end;
  begin
    perform public.set_booking_charge(area_a, 150);
    execute 'reset role';
    select charge into ch from public.booking_areas where id = area_a;
    select society_id::text into t from public.access_log where action = 'booking_charge_set' order by at desc limit 1;
    res := res || E'\n10 set_booking_charge on our own area: charge ' || ch || ' (want 150), logged for ' || case when t = aakar::text then 'the first society' else coalesce(t, 'nobody') end || ' (want the first society)';
    if ch <> 150 or t is distinct from aakar::text then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n10 set_booking_charge on our own area: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;
  execute 'reset role';
  select charge into ch from public.booking_areas where id = area_b;
  res := res || E'\n11 the second society''s area still costs ' || ch || ' (want 500) and its approved booking is ' || (select status from public.bookings where group_id = gb1 limit 1) || ' (want approved), its request ' || (select status from public.bookings where group_id = gb2 limit 1) || ' (want pending)';
  if ch <> 500 or (select status from public.bookings where group_id = gb1 limit 1) <> 'approved' or (select status from public.bookings where group_id = gb2 limit 1) <> 'pending' then ok := false; end if;

  -- 2. the same login, now in the SECOND society ----------------------------------------------------------------------------------------
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.booked_slots(public.booking_today() - 1, public.booking_today() + 60);
  select count(*) into n2 from public.booked_slots(public.booking_today() - 1, public.booking_today() + 60) where area_id = area_a;
  res := res || E'\n12 same login in the second society: booked_slots ' || n || ' row(s) (want 2: its approved booking and its request), of the first society ' || n2 || ' (want 0)';
  if n <> 2 or n2 <> 0 then ok := false; end if;
  begin
    perform public.cancel_booking(g1, 'zz');
    res := res || E'\n13 cancel_booking of the first society''s booking: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n13 cancel_booking of the first society''s booking: refused "' || sqlerrm || '" (want Nothing to cancel.)';
    if sqlerrm is distinct from 'Nothing to cancel.' then ok := false; end if;
  end;
  begin
    perform public.decide_booking(ga2, true, null);
    res := res || E'\n14 decide_booking of the first society''s request: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n14 decide_booking of the first society''s request: refused "' || sqlerrm || '" (want This request is not waiting for approval.)';
    if sqlerrm is distinct from 'This request is not waiting for approval.' then ok := false; end if;
  end;
  begin
    perform public.request_booking('A101', array[area_a], d + 60, 'day', 'zz', false);
    res := res || E'\n15 request_booking for the first society''s area: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n15 request_booking for the first society''s area: refused "' || sqlerrm || '" (want Area not available.)';
    if sqlerrm is distinct from 'Area not available.' then ok := false; end if;
  end;
  begin
    perform public.set_booking_charge(area_a, 999);
    res := res || E'\n16 set_booking_charge on the first society''s area: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n16 set_booking_charge on the first society''s area: refused "' || sqlerrm || '" (want Area not found.)';
    if sqlerrm is distinct from 'Area not found.' then ok := false; end if;
  end;
  begin
    g1 := public.request_booking('A101', array[area_b], d + 61, 'day', 'zz', false);
    execute 'reset role';
    select society_id::text into t from public.bookings where group_id = g1 limit 1;
    res := res || E'\n17 request_booking for the second society''s own area: made, belongs to ' || case when t = other::text then 'the second society' else coalesce(t, 'null') end || ' (want the second society)';
    if t is distinct from other::text then ok := false; end if;
    execute 'set local role authenticated';
  exception when others then
    execute 'reset role'; execute 'set local role authenticated';
    res := res || E'\n17 request_booking for the second society''s own area: ERROR ' || sqlerrm || ' (want a booking)  <-- WRONG'; ok := false;
  end;
  execute 'reset role';

  -- 3. a login that belongs to NO society finds nothing ---------------------------------------------------------------------------------
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.booked_slots(public.booking_today() - 1, public.booking_today() + 60);
  res := res || E'\n18 login with no society: booked_slots ' || n || ' row(s) (want 0)';
  if n <> 0 then ok := false; end if;
  n2 := 0;
  begin perform public.request_booking('A101', array[area_a], d + 70, 'day', 'zz', false); n2 := n2 + 1; exception when others then null; end;
  begin perform public.cancel_booking(gb1, 'zz'); n2 := n2 + 1; exception when others then null; end;
  begin perform public.decide_booking(gb2, true, null); n2 := n2 + 1; exception when others then null; end;
  begin perform public.set_booking_charge(area_a, 321); n2 := n2 + 1; exception when others then null; end;
  res := res || E'\n19 login with no society: request / cancel / decide / set charge that went through: ' || n2 || ' (want 0)';
  if n2 <> 0 then ok := false; end if;
  execute 'reset role';

  res := res || E'\n20 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
