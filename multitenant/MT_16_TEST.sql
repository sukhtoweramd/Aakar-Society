-- MT_16_TEST.sql (Nov 2026) - tries MT_16 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- everything is rolled back (the red error is expected; read the lines after "RESULT:"). Not for live Aakar (no reason to: it adds temporary societies).
-- Needs MT_16 run. Uses one committee login of the test project as the "logged-in" user.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; j jsonb; old_m uuid[];
  s_act constant uuid := 'c5c5c5c5-0000-4000-8000-000000000005'; s_off constant uuid := 'c6c6c6c6-0000-4000-8000-000000000006';
begin
  if to_regprocedure('public.society_public(text)') is null then raise exception 'MT_16 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found.'; end if;
  insert into public.societies (id, slug, name, status) values (s_act, 'zz-word-ok', 'ZZ Active', 'active'), (s_off, 'zz-word-off', 'ZZ Paused', 'suspended');
  execute 'set local role anon';
  j := public.society_public('zz-word-ok');
  res := res || E'\n1 society_public of an active society (as the login page, not logged in): ' || coalesce(j::text, 'nothing') || ' (want slug + name only)';
  if j is null or j ->> 'name' <> 'ZZ Active' or (select count(*) from jsonb_object_keys(j)) <> 2 then ok := false; end if;
  j := public.society_public('  ZZ-Word-OK ');
  res := res || E'\n2 same word typed with capitals and spaces: ' || coalesce(j ->> 'slug', 'nothing') || ' (want zz-word-ok)';
  if j ->> 'slug' is distinct from 'zz-word-ok' then ok := false; end if;
  j := public.society_public('zz-word-off');
  res := res || E'\n3 a paused society: ' || coalesce(j::text, 'nothing') || ' (want nothing)';
  if j is not null then ok := false; end if;
  j := public.society_public('zz-no-such');
  res := res || E'\n4 a word that does not exist: ' || coalesce(j::text, 'nothing') || ' (want nothing)';
  if j is not null then ok := false; end if;
  begin perform public.my_society(); res := res || E'\n5 my_society as anon: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n5 my_society as anon: refused (want refused)'; end;
  execute 'reset role';
  -- the committee login belongs to the active test society only
  delete from public.society_memberships where user_id = uid;
  insert into public.society_memberships (user_id, society_id, role) values (uid, s_act, 'committee');
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
  execute 'set local role authenticated';
  j := public.my_society();
  res := res || E'\n6 my_society of a logged-in login: ' || coalesce(j::text, 'nothing') || ' (want zz-word-ok / ZZ Active)';
  if j ->> 'slug' is distinct from 'zz-word-ok' then ok := false; end if;
  execute 'reset role';
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  j := public.my_society();
  res := res || E'\n7 my_society of a login with no society: ' || coalesce(j::text, 'nothing') || ' (want nothing)';
  if j is not null then ok := false; end if;
  execute 'reset role';
  res := res || E'\n8 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
