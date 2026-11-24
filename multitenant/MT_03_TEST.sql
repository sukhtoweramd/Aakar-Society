-- MT_03_TEST.sql (Nov 2026) - tries MT_03 on the TEST project only ("aanganone"). Never on Aakar's live database.
-- It pretends to be the first committee login, moves that login's membership around, reads what active_society(), is_committee()
-- and is_main_admin() answer, then ends with a deliberate error so that EVERYTHING it changed is rolled back.
-- So: the red error at the end is expected, and the line after "RESULT:" is the answer. Safe to run any number of times.
do $$
declare
  uid uuid; res text := ''; aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found. Create the first committee login first (RUN_ORDER.md, step 2a).'; end if;

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  res := res || E'\n1 normal committee login      : society=' || coalesce(public.active_society()::text, 'null') || ' committee=' || public.is_committee() || ' main_admin=' || public.is_main_admin();

  update public.society_memberships set role = 'flat' where user_id = uid;
  res := res || E'\n2 member as a FLAT (role flat)  : committee=' || public.is_committee() || ' main_admin=' || public.is_main_admin() || '   (want false, false)';

  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  update public.society_memberships set role = 'committee', society_id = other where user_id = uid;
  res := res || E'\n3 committee of ANOTHER society  : society=' || coalesce(public.active_society()::text, 'null') || ' (not Aakar: ' || (public.active_society() is distinct from aakar) || ') committee=' || public.is_committee() || ' main_admin=' || public.is_main_admin();

  update public.society_memberships set role = 'society_admin', society_id = aakar where user_id = uid;
  res := res || E'\n4 society_admin of Aakar         : committee=' || public.is_committee() || ' main_admin=' || public.is_main_admin() || '   (want true, true)';

  delete from public.society_memberships where user_id = uid;
  res := res || E'\n5 no membership (transition)    : society=' || coalesce(public.active_society()::text, 'null') || ' committee=' || public.is_committee() || ' main_admin=' || public.is_main_admin() || '   (want null, true, true = old rule)';

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid()::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
  res := res || E'\n6 unknown login claiming committee: committee=' || public.is_committee() || ' main_admin=' || public.is_main_admin() || '   (want false, false)';

  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
