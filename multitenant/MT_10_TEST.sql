-- MT_10_TEST.sql (Nov 2026) - tries MT_10 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate
-- error so EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). Do not run it on Aakar's live
-- database (it temporarily moves a login to another society; rolled back, but there is no reason to do it where the data matters).
-- Acts as the first committee login (a real "authenticated" database user), gives a SECOND society a flat with the SAME id as one of the first
-- society's flats (A101), a family member and a business entry, and checks what each directory view shows to a login of the first society,
-- to the same login moved to the second society, and to a login with no society.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; n int; n2 int; n3 int; owners int;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  if pg_get_viewdef('public.flat_directory'::regclass, true) !~ 'active_society' then raise exception 'MT_10 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then raise exception 'The first society has no flat A101 here (load SAMPLE_DATA.sql).'; end if;
  select count(*) into owners from public.flats where society_id = aakar;

  -- a second society with its own A101 (same flat id), a family member and a business entry; the first society's A101 agrees to be listed too
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  insert into public.flats (society_id, id, tower, floor, flat_no, owner_name, directory_consent) values (other, 'A101', 'A', 1, 'A101', 'ZZ OTHER OWNER', true);
  insert into public.members (society_id, flat_id, name, relation, occupation, business_name) values (other, 'A101', 'ZZ OTHER MEMBER', 'Self', 'ZZ trader', 'ZZ OTHER SHOP');
  update public.flats set directory_consent = true where society_id = aakar and id = 'A101';

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  -- 1. a login of the FIRST society
  execute 'set local role authenticated';
  select count(*) into n from public.flat_directory;
  select count(*) into n2 from public.flat_directory where owner_name like 'ZZ%';
  res := res || E'\n1 flat_directory for the first society: ' || n || ' flats (want ' || owners || '), of the second society ' || n2 || ' (want 0)';
  if n <> owners or n2 <> 0 then ok := false; end if;
  select count(*) into n from public.member_directory where member_name like 'ZZ%' or owner_name like 'ZZ%';
  res := res || E'\n2 member_directory: rows of the second society ' || n || ' (want 0)  [its A101 has the same id as ours]';
  if n <> 0 then ok := false; end if;
  select count(*) into n from public.business_directory where name like 'ZZ%' or business_name like 'ZZ%';
  res := res || E'\n3 business_directory: entries of the second society ' || n || ' (want 0)';
  if n <> 0 then ok := false; end if;
  select count(*) into n from public.member_directory where flat_id = 'A101';
  select count(*) into n2 from public.members where flat_id = 'A101';          -- the wall already shows only our own members here
  res := res || E'\n4 member_directory rows for our A101: ' || n || ' (want ' || greatest(n2, 1) || ' = our members, or one row when it has none)';
  if n <> greatest(n2, 1) then ok := false; end if;

  -- 2. the same login, now in the SECOND society: sees only that society
  execute 'reset role';
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.flat_directory;
  select count(*) into n2 from public.flat_directory where owner_name = 'ZZ OTHER OWNER';
  res := res || E'\n5 same login in the second society: flat_directory ' || n || ' flat(s) (want 1), it is the second society''s ' || n2 || ' (want 1)';
  if n <> 1 or n2 <> 1 then ok := false; end if;
  select count(*) into n from public.member_directory;
  select count(*) into n2 from public.member_directory where member_name = 'ZZ OTHER MEMBER';
  res := res || E'\n6 member_directory ' || n || ' row(s) (want 1), the second society''s member ' || n2 || ' (want 1)';
  if n <> 1 or n2 <> 1 then ok := false; end if;
  select count(*) into n from public.business_directory;
  select count(*) into n2 from public.business_directory where business_name = 'ZZ OTHER SHOP';
  res := res || E'\n7 business_directory ' || n || ' entry (want 1), the second society''s shop ' || n2 || ' (want 1)';
  if n <> 1 or n2 <> 1 then ok := false; end if;

  -- 3. a login that belongs to NO society sees nothing
  execute 'reset role';
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.flat_directory;
  select count(*) into n2 from public.member_directory;
  select count(*) into n3 from public.business_directory;
  res := res || E'\n8 a login with no society: flat_directory ' || n || ', member_directory ' || n2 || ', business_directory ' || n3 || ' (want 0 / 0 / 0)';
  if n + n2 + n3 <> 0 then ok := false; end if;

  -- 4. nobody without a login
  execute 'reset role';
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.flat_directory';
    res := res || E'\n9 anon can read flat_directory: yes (want no)  <-- WRONG'; ok := false;
  exception when others then
    res := res || E'\n9 anon can read flat_directory: no (want no)';
  end;
  execute 'reset role';

  res := res || E'\n10 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
