-- MT_11_TEST.sql (Nov 2026) - tries MT_11 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on Aakar's live database (it temporarily
-- moves the committee login to another society, changes its token role and edits flats; rolled back, but there is no reason to do that where the data matters).
-- It gives a SECOND society flats with the SAME ids as the first society's (A101, A102), a Chairman and a Secretary, family members, a tenant login and
-- its own settings, then acts as the first committee login (a real "authenticated" database user) in the first society, in the second society,
-- as a tenant login of the second society and as a login with no society, and checks that every function answers for that society only.
-- Needs the first society to have flats A101 and A102 and one committee login (the sample data of the test project).
do $$
declare
  uid uuid; res text := ''; ok boolean := true; n int; n2 int; b boolean; t text; bid uuid; tl text; lim text; exp_committee int; aak_members int;
  setup_tenant boolean := false; setup_bill boolean := false;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  if pg_get_functiondef('public.committee_people()'::regprocedure) !~ 'active_society' then raise exception 'MT_11 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if (select count(*) from public.flats where society_id = aakar and id in ('A101', 'A102')) < 2 then raise exception 'The first society needs flats A101 and A102 (load SAMPLE_DATA.sql).'; end if;

  -- first society: A101 is a plain committee member, nobody is Chairman / Secretary, A102 is an owner's flat
  update public.flats set committee_role = null where society_id = aakar and committee_role ~* '(chair|secretary)';
  update public.flats set is_committee = true, committee_role = 'Member', committee_person = 'AAKAR COMMITTEE', occupancy = 'owner' where society_id = aakar and id = 'A101';
  update public.flats set is_committee = false, committee_role = null, occupancy = 'owner' where society_id = aakar and id = 'A102';
  select count(*) into exp_committee from public.flats where society_id = aakar and is_committee;
  -- second society: the SAME flat ids, a Chairman and a Secretary, a rented A102
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  insert into public.flats (society_id, id, tower, floor, flat_no, owner_name, is_committee, committee_role, committee_person, occupancy) values
    (other, 'A101', 'A', 1, 'A101', 'ZZ OWNER 101', true,  'Chairman',  'ZZ CHAIR', 'owner'),
    (other, 'A102', 'A', 1, 'A102', 'ZZ OWNER 102', true,  'Secretary', 'ZZ SEC',   'tenant'),
    (other, 'ZZ99', 'A', 9, 'ZZ99', 'ZZ ONLY OWNER', false, null,       null,       'owner');
  insert into public.members (society_id, flat_id, name, relation) values (other, 'A101', 'ZZ M1', 'Self'), (other, 'A101', 'ZZ M2', 'Spouse');
  select count(*) into aak_members from public.members where society_id = aakar and flat_id = 'A101';
  if aak_members = 0 then insert into public.members (society_id, flat_id, name, relation) values (aakar, 'A101', 'AAKAR M1', 'Self'); aak_members := 1; end if;
  insert into public.app_settings (society_id, id, area_backup_limit) values (aakar, 1, 7), (other, 1, 9)
    on conflict (society_id, id) do update set area_backup_limit = excluded.area_backup_limit;
  begin   -- a tenant login of the SECOND society for its rented A102 (the committee login is borrowed for it below)
    insert into public.flat_tenant_logins (society_id, user_id, flat_id, tenant_name, active) values (other, uid, 'A102', 'ZZ TENANT', true);
    setup_tenant := true;
  exception when others then res := res || E'\n(could not set up the tenant login: ' || sqlerrm || ')';
  end;
  begin   -- a tenant bill in the FIRST society (needs one of its bills)
    select id into bid from public.bills where society_id = aakar limit 1;
    if bid is not null then update public.bills set tenant_bill = true where id = bid; setup_bill := true; end if;
  exception when others then res := res || E'\n(could not set up the bill: ' || sqlerrm || ')';
  end;

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- 1. the committee login of the FIRST society -----------------------------------------------------------------------------------------
  execute 'set local role authenticated';
  select count(*) into n from public.committee_people();
  select count(*) into n2 from public.committee_people() where person like 'ZZ%';
  res := res || E'\n1 first society: committee_people ' || n || ' flat(s) (want ' || exp_committee || '), of the second society ' || n2 || ' (want 0)';
  if n <> exp_committee or n2 <> 0 then ok := false; end if;
  b := public.can_approve_booking();
  res := res || E'\n2 first society has no Chairman / Secretary: can_approve_booking ' || b || ' (want true; the second society''s Chairman must not count)';
  if b is distinct from true then ok := false; end if;
  begin
    b := public.flat_is_rented('A102');
    res := res || E'\n3 flat_is_rented(A102): ' || b || ' (want false: ours is an owner flat, the second society''s A102 is rented)';
    if b is distinct from false then ok := false; end if;
  exception when others then res := res || E'\n3 flat_is_rented(A102): ERROR ' || sqlerrm || ' (want false)  <-- WRONG'; ok := false;
  end;
  lim := public.area_rights() ->> 'limit';
  res := res || E'\n4 area_rights limit ' || lim || ' (want 7 = our own setting, not 9)';
  if lim is distinct from '7' then ok := false; end if;
  select coalesce(sum(people), 0) into n from public.flat_people_counts() where flat_id = 'A101';
  res := res || E'\n5 flat_people_counts for A101: ' || n || ' (want ' || aak_members || ' = our members only, not the second society''s 2)';
  if n <> aak_members then ok := false; end if;
  if setup_bill then
    b := public.bill_is_tenant(bid);
    res := res || E'\n6 bill_is_tenant(our tenant bill): ' || b || ' (want true)';
    if b is distinct from true then ok := false; end if;
  else res := res || E'\n6 bill_is_tenant: skipped (no bill in the first society here)'; end if;
  begin   -- a committee login of the first society whose token carries the flat A102: its own flat is NOT a committee flat here
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee', 'flat_id', 'A102'))::text, true);
    b := public.my_flat_is_committee();
    res := res || E'\n7 login with flat A102 in the first society: my_flat_is_committee ' || b || ' (want false; the second society''s A102 is a committee flat)';
    if b is distinct from false then ok := false; end if;
  exception when others then res := res || E'\n7 my_flat_is_committee: ERROR ' || sqlerrm || ' (want false)  <-- WRONG'; ok := false;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- 2. the same login, now in the SECOND society ----------------------------------------------------------------------------------------
  execute 'reset role';
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.committee_people();
  select count(*) into n2 from public.committee_people() where person like 'AAKAR%';
  res := res || E'\n8 same login in the second society: committee_people ' || n || ' (want 2: ZZ CHAIR and ZZ SEC), of the first society ' || n2 || ' (want 0)';
  if n <> 2 or n2 <> 0 then ok := false; end if;
  b := public.can_approve_booking();
  res := res || E'\n9 second society has a Chairman and a Secretary, this login is neither: can_approve_booking ' || b || ' (want false)';
  if b is distinct from false then ok := false; end if;
  b := public.flat_is_rented('A102');
  res := res || E'\n10 flat_is_rented(A102) in the second society: ' || b || ' (want true)';
  if b is distinct from true then ok := false; end if;
  lim := public.area_rights() ->> 'limit';
  res := res || E'\n11 area_rights limit ' || lim || ' (want 9 = the second society''s own setting)';
  if lim is distinct from '9' then ok := false; end if;
  select coalesce(sum(people), 0) into n from public.flat_people_counts() where flat_id = 'A101';
  res := res || E'\n12 flat_people_counts for A101: ' || n || ' (want 2 = the second society''s members)';
  if n <> 2 then ok := false; end if;
  if setup_bill then
    b := public.bill_is_tenant(bid);
    res := res || E'\n13 bill_is_tenant(the first society''s bill): ' || b || ' (want false: not this society''s bill)';
    if b is distinct from false then ok := false; end if;
  else res := res || E'\n13 bill_is_tenant: skipped'; end if;

  -- 3. tenant login of the second society -----------------------------------------------------------------------------------------------
  execute 'reset role';
  update auth.users set raw_app_meta_data = jsonb_build_object('role', 'tenant', 'tenant_flat', 'A102') where id = uid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'tenant', 'tenant_flat', 'A102'))::text, true);
  if setup_tenant then
    execute 'set local role authenticated';
    tl := public.my_tenant_flat(); b := public.flat_has_tenant_login('A102');
    res := res || E'\n14 tenant login in its own (second) society: my_tenant_flat ' || coalesce(tl, 'null') || ' (want A102), flat_has_tenant_login(A102) ' || b || ' (want true)';
    if tl is distinct from 'A102' or b is distinct from true then ok := false; end if;
    execute 'reset role';
    update public.society_memberships set society_id = aakar where user_id = uid;       -- the token says tenant of the second society, but the login now belongs to the first
    execute 'set local role authenticated';
    tl := public.my_tenant_flat(); b := public.flat_has_tenant_login('A102');
    res := res || E'\n15 the same login, now in the first society: my_tenant_flat ' || coalesce(tl, 'null') || ' (want null), flat_has_tenant_login(A102) ' || b || ' (want false)';
    if tl is not null or b is distinct from false then ok := false; end if;
  else res := res || E'\n14 / 15 tenant checks skipped (tenant login could not be set up)'; end if;

  -- 4. a login that belongs to NO society finds nothing ---------------------------------------------------------------------------------
  execute 'reset role';
  update auth.users set raw_app_meta_data = jsonb_build_object('role', 'committee') where id = uid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.committee_people();
  b := public.flat_is_rented('A102');
  lim := public.area_rights() ->> 'limit';
  select count(*) into n2 from public.flat_people_counts();
  res := res || E'\n16 login with no society: committee_people ' || n || ', flat_is_rented ' || b || ', area_rights limit ' || lim || ', flat_people_counts ' || n2 || ' (want 0 / false / 4 = the default, not Aakar''s 7 / 0)';
  if n <> 0 or b is distinct from false or lim is distinct from '4' or n2 <> 0 then ok := false; end if;
  execute 'reset role';

  -- 5. flat_blockers (the server's own key; here called directly) ---------------------------------------------------------------------
  begin
    select blockers into t from public.flat_blockers(array['ZZ99'], other);
    res := res || E'\n17 flat_blockers(ZZ99, second society): "' || coalesce(t, 'null') || '" (want a list that starts with owner_name)';
    if t is null or t not like 'owner_name%' then ok := false; end if;
    select blockers into t from public.flat_blockers(array['ZZ99']);
    res := res || E'\n18 flat_blockers(ZZ99) without a society = the first society''s: "' || coalesce(t, 'null') || '" (want "no such flat")';
    if t is distinct from 'no such flat' then ok := false; end if;
    select blockers into t from public.flat_blockers(array['A101'], other);
    res := res || E'\n19 flat_blockers(A101, second society) counts members: "' || coalesce(substring(t from 'members\.flat_id \((\d+)\)'), 'none') || '" (want 2)';
    if substring(t from 'members\.flat_id \((\d+)\)') is distinct from '2' then ok := false; end if;
    select blockers into t from public.flat_blockers(array['A101'], aakar);
    res := res || E'\n20 flat_blockers(A101, first society) counts members: "' || coalesce(substring(t from 'members\.flat_id \((\d+)\)'), 'none') || '" (want ' || aak_members || ')';
    if substring(t from 'members\.flat_id \((\d+)\)') is distinct from aak_members::text then ok := false; end if;
  exception when others then res := res || E'\n17-20 flat_blockers: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;

  res := res || E'\n21 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
