-- MT_17_TEST.sql (Nov 2026) - tries MT_17 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on Aakar's live database
-- (it moves the committee login to another society and changes document counters, rolled back, but there is no reason to do that where the data matters).
-- Needs MT_17 run, the first society with its committee login (the sample data of the test project) and a billing_settings row for the first society.
-- What it checks:
--   1 the bill counter of the login's society moves, the other society's counter does not (and the other way round)
--   2 a login with no membership is no longer committee (the old transition rule is gone) and cannot take a number
--   3 an insert that does not name its society gets the login's society; with no login it fails (not null) instead of landing in the first society
--   4 a call with no society is refused (require_society, flat_blockers)
--   5 the old function is gone and nothing uses it
do $$
declare
  uid uuid; res text := ''; ok boolean := true; e text; n int; k int; old_meta jsonb; sid uuid; first_no int;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  a_before int; a_after int; o_before int; o_after int; isc boolean;
begin
  if to_regprocedure('public.require_society(uuid)') is null then raise exception 'MT_17 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.society_memberships where user_id = uid and society_id = aakar) then raise exception 'The committee login must belong to the first society.'; end if;

  begin
    insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
    insert into public.billing_settings (society_id, id) values (aakar, 1) on conflict do nothing;
    -- the other society gets a copy of the first society's settings, with its own counter far away
    insert into public.billing_settings select (jsonb_populate_record(null::public.billing_settings, to_jsonb(b) || jsonb_build_object('society_id', other))).*
      from public.billing_settings b where b.society_id = aakar and b.id = 1 on conflict do nothing;
    update public.billing_settings set bill_last_no = 500 where society_id = other and id = 1;
  exception when others then
    raise exception 'MT_17_TEST setup failed: % (%)', sqlerrm, sqlstate;
  end;

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- 1. document numbers follow the login's society ---------------------------------------------------------------------------------------
  select bill_last_no into a_before from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into o_before from public.billing_settings where society_id = other and id = 1;
  select f.first_no into first_no from public.next_doc_numbers('bill', 1) f;
  select bill_last_no into a_after from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into o_after from public.billing_settings where society_id = other and id = 1;
  res := res || E'\n1 bill number as a login of the FIRST society: its counter ' || a_before || ' -> ' || a_after || ' (want +1), the other society''s ' || o_before || ' -> ' || o_after || ' (want unchanged)';
  if a_after <> a_before + 1 or o_after <> o_before then ok := false; end if;

  update public.society_memberships set society_id = other where user_id = uid;
  select f.first_no into first_no from public.next_doc_numbers('bill', 2) f;
  select bill_last_no into a_before from public.billing_settings where society_id = aakar and id = 1;
  select bill_last_no into o_after from public.billing_settings where society_id = other and id = 1;
  res := res || E'\n2 two bill numbers as the same login moved to the SECOND society: its counter ' || o_before || ' -> ' || o_after || ' (want +2), the first society''s stays ' || a_after || ' -> ' || a_before || ' (want unchanged)';
  if o_after <> o_before + 2 or a_before <> a_after then ok := false; end if;

  -- 2. no membership = no committee -------------------------------------------------------------------------------------------------------
  select raw_app_meta_data into old_meta from auth.users where id = uid;
  delete from public.society_memberships where user_id = uid;
  isc := public.is_committee();
  begin perform * from public.next_doc_numbers('bill', 1); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n3 login with the committee role but NO membership: is_committee() = ' || coalesce(isc::text, '?') || ' (want false), taking a number: ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if isc is distinct from false or e = '' then ok := false; end if;
  insert into public.society_memberships (user_id, society_id, role) values (uid, other, 'committee');

  -- 3. defaults ------------------------------------------------------------------------------------------------------------------------------
  insert into public.letter_templates (name, kind, subject, body, member_fields) values ('ZZ FORMAT D', 'general', 's', 'b', array['x']) returning society_id into sid;
  res := res || E'\n4 insert that does not name its society, as a login of the second society: society_id = ' || (case when sid = other then 'second society' when sid = aakar then 'FIRST society  <-- WRONG' else coalesce(sid::text, 'null') end) || ' (want second society)';
  if sid is distinct from other then ok := false; end if;
  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  begin
    insert into public.letter_templates (name, kind, subject, body, member_fields) values ('ZZ FORMAT E', 'general', 's', 'b', array['x']);
    e := '';
  exception when others then e := sqlstate || ' ' || sqlerrm; end;
  res := res || E'\n5 insert that does not name its society, with NO login (SQL Editor / server key): ' || case when e = '' then 'ACCEPTED (it would land in some society)  <-- WRONG' else 'refused "' || e || '"' end || ' (want refused, 23502)';
  if e = '' or e not like '23502%' then ok := false; end if;

  -- 4. calls with no society ---------------------------------------------------------------------------------------------------------------
  begin perform public.require_society(null); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n6 require_society(null): ' || case when e like 'Society missing%' then 'refused' else 'NOT refused  <-- WRONG' end;
  if e not like 'Society missing%' then ok := false; end if;
  begin perform * from public.flat_blockers(array['A101'], null); e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n7 flat_blockers with no society: ' || case when e like 'Society missing%' then 'refused' else 'NOT refused ("' || e || '")  <-- WRONG' end;
  if e not like 'Society missing%' then ok := false; end if;
  res := res || E'\n8 clear_test_documents / restore_society_backup use require_society: ' ||
        (pg_get_functiondef('public.clear_test_documents(integer, integer, integer, integer, uuid)'::regprocedure) like '%require_society(p_society)%'
         and pg_get_functiondef('public.restore_society_backup(jsonb, uuid)'::regprocedure) like '%require_society(p_society)%')::text || ' (want true)';
  if not (pg_get_functiondef('public.clear_test_documents(integer, integer, integer, integer, uuid)'::regprocedure) like '%require_society(p_society)%'
          and pg_get_functiondef('public.restore_society_backup(jsonb, uuid)'::regprocedure) like '%require_society(p_society)%') then ok := false; end if;

  -- 5. the old function ---------------------------------------------------------------------------------------------------------------------
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%current_society_or_first%';
  select count(*) into k from pg_attrdef df where pg_get_expr(df.adbin, df.adrelid) like '%current_society_or_first%';
  res := res || E'\n9 old function dropped: ' || (to_regprocedure('public.current_society_or_first()') is null)::text || ' (want true); functions still using it: ' || n || ', defaults still using it: ' || k || ' (want 0 and 0)';
  if to_regprocedure('public.current_society_or_first()') is not null or n <> 0 or k <> 0 then ok := false; end if;

  res := res || E'\n10 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
