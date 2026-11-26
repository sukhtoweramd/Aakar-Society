-- MT_14_TEST.sql (Nov 2026) - tries MT_14 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on Aakar's live database (it moves the
-- committee login to another society, turns it into a flat login for a moment, adds flats, areas, complaints, letter requests, meetings and payment reports;
-- rolled back, but there is no reason to do that where the data matters).
-- It gives a SECOND society its own area, complaint, letter request, committee meeting, action point and payment report (and the same flat id A101), then acts as
-- real "authenticated" database users:
--   part 1  the committee login of the first society tries to change / read the OTHER society's things (must be refused or find nothing) and its own (must work);
--   part 2  the same login as a plain flat login (A101) of the first society: the other society's A101 must not be its flat;
--   part 3  the same login moved to the second society tries the same against the first;
--   part 4  a login with no society.
-- Needs the first society to have flat A101 and one committee login (the sample data of the test project), and MT_14 run.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; n int; t_n2 int; t_status text; e text; j jsonb; old_meta jsonb;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  area_a uuid := gen_random_uuid(); area_b uuid := gen_random_uuid();
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid();
  lr_a uuid := gen_random_uuid(); lr_a2 uuid := gen_random_uuid(); lr_b uuid := gen_random_uuid(); lr_b2 uuid := gen_random_uuid();
  m_a uuid := gen_random_uuid(); m_b uuid := gen_random_uuid();
  act_a uuid := gen_random_uuid(); act_a101 uuid := gen_random_uuid(); act_a3 uuid := gen_random_uuid(); act_b uuid := gen_random_uuid(); act_b2 uuid := gen_random_uuid();
  nf constant text := 'Complaint not found.'; np constant text := 'This action point is not yours or is already done.'; nl constant text := 'This request is not yours or is no longer waiting.';
begin
  if pg_get_functiondef('public.update_complaint(uuid,text,text)'::regprocedure) !~ 'active_society' then raise exception 'MT_14 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then raise exception 'The first society needs flat A101 (load SAMPLE_DATA.sql).'; end if;
  select raw_app_meta_data into old_meta from auth.users where id = uid;

  -- act as the committee login from the start (the guards on flats refuse committee things from a login-less SQL Editor)
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  begin
    insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
    insert into public.flats (society_id, id, tower, floor, flat_no, owner_name) values (other, 'A101', 'A', 1, 'A101', 'ZZ OWNER 101');
    insert into public.flats (society_id, id, tower, floor, flat_no, owner_name) values (aakar, 'ZZ01', 'A', 1, 'ZZ01', 'AAKAR ZZ01'), (aakar, 'ZZ02', 'A', 1, 'ZZ02', 'AAKAR ZZ02');
    update public.flats set owner_name = 'AAKAR OWNER' where society_id = aakar and id = 'A101';
    -- areas: inserted as the SQL Editor would (no login, so the area guard does not ask for the Chairman); then the login is back
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    insert into public.committee_areas (society_id, id, name, holder_flat) values (aakar, area_a, 'ZZ AREA A', 'ZZ01'), (other, area_b, 'ZZ AREA B', 'A101');
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
    insert into public.complaints (society_id, id, flat_id, area_id, assigned_flat, description) values
      (aakar, c_a, 'ZZ02', area_a, 'ZZ01', 'ZZ complaint of the first society'), (other, c_b, 'A101', area_b, 'A101', 'ZZ complaint of the second society');
    insert into public.letter_requests (society_id, id, flat_id, letter_type) values
      (aakar, lr_a, 'ZZ02', 'ZZ letter'), (aakar, lr_a2, 'ZZ02', 'ZZ letter'), (other, lr_b, 'A101', 'ZZ letter'), (other, lr_b2, 'A101', 'ZZ letter');
    insert into public.meetings (society_id, id, kind, meeting_date) values (aakar, m_a, 'Committee', current_date), (other, m_b, 'Committee', current_date);
    insert into public.meeting_actions (society_id, id, meeting_id, task, owner_flat) values
      (aakar, act_a, m_a, 'ZZ task a', 'ZZ02'), (aakar, act_a101, m_a, 'ZZ task a101', 'A101'), (aakar, act_a3, m_a, 'ZZ task a3', 'ZZ02'), (other, act_b, m_b, 'ZZ task b', 'A101'), (other, act_b2, m_b, 'ZZ task b2', 'A101');
    insert into public.payment_reports (society_id, flat_id, amount, paid_on, mode, ref, status) values
      (aakar, 'ZZ02', 10, current_date, 'UPI', 'ZZUTRAAKAR1', 'pending'), (other, 'A101', 10, current_date, 'UPI', 'ZZUTROTHER2', 'pending');
  exception when others then
    raise exception 'MT_14_TEST setup failed: % (%)', sqlerrm, sqlstate;
  end;

  -- 1. the committee login of the FIRST society -----------------------------------------------------------------------------------------
  execute 'set local role authenticated';
  begin perform public.update_complaint(c_b, 'in_progress', 'zz'); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n1 update_complaint of the SECOND society''s complaint: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from nf then ok := false; end if;
  begin perform public.update_complaint(c_a, 'in_progress', 'zz'); e := ''; exception when others then e := sqlerrm; end;
  execute 'reset role'; select status into t_status from (select status from public.complaints where id = c_a) q; execute 'set local role authenticated';
  res := res || E'\n2 update_complaint of our own complaint: ' || coalesce(nullif(e, ''), 'done') || ', status now ' || coalesce(t_status, '?') || ' (want in_progress)';
  if e <> '' or t_status is distinct from 'in_progress' then ok := false; end if;
  begin perform public.reassign_complaint(c_b, area_a); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n3 reassign_complaint of the second society''s complaint: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from nf then ok := false; end if;
  begin perform public.reassign_complaint(c_a, area_b); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n4 reassign_complaint to the second society''s area: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from 'Area not found.' then ok := false; end if;
  begin perform public.reassign_complaint(c_a, area_a); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n5 reassign_complaint of our own complaint to our own area: ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
  if e <> '' then ok := false; end if;
  begin perform public.withdraw_letter_request(lr_b); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n6 withdraw_letter_request of the second society''s request: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from nl then ok := false; end if;
  begin perform public.withdraw_letter_request(lr_a); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n7 withdraw_letter_request of our own request: ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
  if e <> '' then ok := false; end if;
  begin perform public.mark_my_action_done(act_b, 'zz'); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n8 mark_my_action_done of the second society''s action point: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from np then ok := false; end if;
  begin perform public.mark_my_action_done(act_a, 'zz'); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n9 mark_my_action_done of our own action point: ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
  if e <> '' then ok := false; end if;
  select count(*) filter (where id = m_a), count(*) filter (where id = m_b) into n, t_n2 from public.my_committee_meetings();
  res := res || E'\n10 my_committee_meetings: our meeting ' || n || ' (want 1), the second society''s ' || t_n2 || ' (want 0)';
  if n <> 1 or t_n2 <> 0 then ok := false; end if;
  j := public.my_meeting(m_b);
  res := res || E'\n11 my_meeting of the second society''s meeting: ' || case when j is null then 'nothing' else 'RETURNED  <-- WRONG' end || ' (want nothing)';
  if j is not null then ok := false; end if;
  j := public.my_meeting(m_a);
  res := res || E'\n12 my_meeting of our own meeting: ' || case when j is null then 'nothing' else 'returned, ' || jsonb_array_length(j -> 'actions') || ' action points' end || ' (want returned, 3)';
  if j is null or jsonb_array_length(j -> 'actions') <> 3 then ok := false; end if;
  j := public.utr_already_reported('ZZUTROTHER2');
  res := res || E'\n13 utr_already_reported of the second society''s reference: found = ' || (j ->> 'found') || ' (want false)';
  if (j ->> 'found') <> 'false' then ok := false; end if;
  j := public.utr_already_reported('ZZUTRAAKAR1');
  res := res || E'\n14 utr_already_reported of our own reference: found = ' || (j ->> 'found') || ' (want true)';
  if (j ->> 'found') <> 'true' then ok := false; end if;
  execute 'reset role';

  -- 2. the same login as a plain FLAT login (A101) of the first society -----------------------------------------------------------------
  begin
    update auth.users set raw_app_meta_data = old_meta || jsonb_build_object('role', 'resident', 'flat_id', 'A101') where id = uid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'resident', 'flat_id', 'A101'))::text, true);
    execute 'set local role authenticated';
    select count(*) filter (where id = act_a101), count(*) filter (where id = act_b) into n, t_n2 from public.my_action_points();
    res := res || E'\n15 my_action_points of flat A101: our A101''s ' || n || ' (want 1), the second society''s A101 ' || t_n2 || ' (want 0)';
    if n <> 1 or t_n2 <> 0 then ok := false; end if;
    begin perform public.mark_my_action_done(act_b2, 'zz'); e := ''; exception when others then e := sqlerrm; end;
    res := res || E'\n16 mark_my_action_done of the second society''s A101 task: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
    if e is distinct from np then ok := false; end if;
    begin perform public.mark_my_action_done(act_a101, 'zz'); e := ''; exception when others then e := sqlerrm; end;
    res := res || E'\n17 mark_my_action_done of our own A101 task: ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
    if e <> '' then ok := false; end if;
    begin perform public.withdraw_letter_request(lr_b2); e := ''; exception when others then e := sqlerrm; end;
    res := res || E'\n18 withdraw_letter_request of the second society''s A101 request: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
    if e is distinct from nl then ok := false; end if;
    begin perform public.update_complaint(c_b, 'in_progress', 'zz'); e := ''; exception when others then e := sqlerrm; end;
    res := res || E'\n19 update_complaint of the second society''s complaint (its responsible flat is also called A101): ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
    if e is distinct from nf then ok := false; end if;
    j := public.my_meeting(m_b);
    res := res || E'\n20 my_meeting of the second society''s meeting (A101 owns a task there): ' || case when j is null then 'nothing' else 'RETURNED  <-- WRONG' end || ' (want nothing)';
    if j is not null then ok := false; end if;
    execute 'reset role';
  exception when others then
    execute 'reset role';
    res := res || E'\n15-20 flat login part: ERROR ' || sqlerrm || '  <-- WRONG'; ok := false;
  end;
  update auth.users set raw_app_meta_data = old_meta where id = uid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- 3. the same login, now in the SECOND society ----------------------------------------------------------------------------------------
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  begin perform public.update_complaint(c_a, 'closed', 'zz'); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n21 update_complaint of the FIRST society''s complaint: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from nf then ok := false; end if;
  begin perform public.update_complaint(c_b, 'in_progress', 'zz'); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n22 update_complaint of its own society''s complaint: ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
  if e <> '' then ok := false; end if;
  begin perform public.reassign_complaint(c_a, area_b); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n23 reassign_complaint of the first society''s complaint: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from nf then ok := false; end if;
  begin perform public.withdraw_letter_request(lr_a2); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n24 withdraw_letter_request of the first society''s request: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from nl then ok := false; end if;
  begin perform public.mark_my_action_done(act_a3, 'zz'); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n25 mark_my_action_done of the first society''s action point: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from np then ok := false; end if;
  select count(*) filter (where id = m_a), count(*) filter (where id = m_b) into n, t_n2 from public.my_committee_meetings();
  res := res || E'\n26 my_committee_meetings: the first society''s ' || n || ' (want 0), its own ' || t_n2 || ' (want 1)';
  if n <> 0 or t_n2 <> 1 then ok := false; end if;
  j := public.my_meeting(m_a);
  res := res || E'\n27 my_meeting of the first society''s meeting: ' || case when j is null then 'nothing' else 'RETURNED  <-- WRONG' end || ' (want nothing)';
  if j is not null then ok := false; end if;
  j := public.utr_already_reported('ZZUTRAAKAR1');
  res := res || E'\n28 utr_already_reported of the first society''s reference: found = ' || (j ->> 'found') || ' (want false)';
  if (j ->> 'found') <> 'false' then ok := false; end if;
  j := public.utr_already_reported('ZZUTROTHER2');
  res := res || E'\n29 utr_already_reported of its own reference: found = ' || (j ->> 'found') || ' (want true)';
  if (j ->> 'found') <> 'true' then ok := false; end if;
  execute 'reset role';

  -- 4. a login that belongs to NO society finds nothing ---------------------------------------------------------------------------------
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  n := 0;
  begin perform public.update_complaint(c_a, 'closed', 'zz'); n := n + 1; exception when others then null; end;
  begin perform public.update_complaint(c_b, 'closed', 'zz'); n := n + 1; exception when others then null; end;
  begin perform public.reassign_complaint(c_a, area_a); n := n + 1; exception when others then null; end;
  begin perform public.withdraw_letter_request(lr_a2); n := n + 1; exception when others then null; end;
  begin perform public.mark_my_action_done(act_a3, 'zz'); n := n + 1; exception when others then null; end;
  if (select count(*) from public.my_committee_meetings()) > 0 then n := n + 1; end if;
  if (select count(*) from public.my_action_points()) > 0 then n := n + 1; end if;
  if public.my_meeting(m_a) is not null or public.my_meeting(m_b) is not null then n := n + 1; end if;
  if (public.utr_already_reported('ZZUTRAAKAR1') ->> 'found') = 'true' or (public.utr_already_reported('ZZUTROTHER2') ->> 'found') = 'true' then n := n + 1; end if;
  res := res || E'\n30 login with no society: complaint x2 / reassign / withdraw / action point / three lists / reference check that gave something: ' || n || ' (want 0)';
  if n <> 0 then ok := false; end if;
  execute 'reset role';

  res := res || E'\n31 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
