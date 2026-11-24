-- MT_08_TEST.sql (Nov 2026) - tries MT_08 on the TEST project only ("aanganone"). Never on Aakar's live database.
-- Acts as the first committee login (a real "authenticated" database user) and adds a notice WITHOUT naming a society:
-- in Aakar (must get Aakar's id), after moving the login to a second society (must get that society's id and be allowed by the wall),
-- and as a call with no login at all (the server's own key: must still get Aakar's id). Ends with a deliberate error so EVERYTHING
-- is rolled back (the red error is expected; read the lines after "RESULT:"). Safe to run any number of times.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; sid uuid;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notices' and column_name = 'society_id'
                  and column_default like '%current_society_or_first%') then
    raise exception 'MT_08 has not been run here yet (notices.society_id still has the old default).';
  end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  execute 'set local role authenticated';
  insert into public.notices (title, content) values ('mt08 test aakar', 'x') returning society_id into sid;
  res := res || E'\n1 committee of Aakar adds a notice without a society : gets ' || case when sid = aakar then 'Aakar' else coalesce(sid::text, 'null') end || '   (want Aakar)';
  if sid is distinct from aakar then ok := false; end if;

  execute 'reset role';
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  begin
    insert into public.notices (title, content) values ('mt08 test other', 'x') returning society_id into sid;
    res := res || E'\n2 same login, now of a SECOND society, adds a notice : gets ' || case when sid = other then 'the second society' else coalesce(sid::text, 'null') end || ' and was allowed   (want the second society)';
    if sid is distinct from other then ok := false; end if;
  exception when others then
    res := res || E'\n2 same login, now of a SECOND society, adds a notice : REFUSED (' || sqlerrm || ')   (want allowed)  <-- WRONG'; ok := false;
  end;
  begin
    insert into public.notices (title, content, society_id) values ('mt08 test into aakar', 'x', aakar);
    res := res || E'\n3 ... names Aakar on purpose                          : allowed   (want refused)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n3 ... names Aakar on purpose                          : refused   (want refused)';
  end;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  insert into public.notices (title, content) values ('mt08 test server', 'x') returning society_id into sid;
  res := res || E'\n4 no login at all (server key) adds a notice            : gets ' || case when sid = aakar then 'Aakar' else coalesce(sid::text, 'null') end || '   (want Aakar, as before)';
  if sid is distinct from aakar then ok := false; end if;

  insert into public.notices (title, content, society_id) values ('mt08 test named', 'x', other) returning society_id into sid;
  res := res || E'\n5 server key names a society itself                      : gets ' || case when sid = other then 'the society named' else coalesce(sid::text, 'null') end || '   (want the society named)';
  if sid is distinct from other then ok := false; end if;

  res := res || E'\n6 overall                                                : ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
