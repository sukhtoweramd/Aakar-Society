-- MT_04_TEST.sql (Nov 2026) - tries the society wall on the TEST project only ("aanganone"). Never on Aakar's live database.
-- Acts as the first committee login (a real "authenticated" database user), counts the flats it can see, moves that login to another
-- society, counts again, tries to write into Aakar's rows, and ends with a deliberate error so EVERYTHING is rolled back.
-- The red error is expected; read the lines after "RESULT:". Safe to run any number of times.
do $$
declare
  uid uuid; res text := ''; n int; aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  execute 'set local role authenticated';
  select count(*) into n from public.flats;
  res := res || E'\n1 committee of Aakar sees flats        : ' || n || '   (want 48 on aanganone)';
  select count(*) into n from public.members;
  res := res || E'\n2 committee of Aakar sees members      : ' || n || '   (want 48)';

  execute 'reset role';
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.flats;
  res := res || E'\n3 same login, now committee of ANOTHER society, flats seen: ' || n || '   (want 0)';
  select count(*) into n from public.bills;
  res := res || E'\n4 ... bills seen                          : ' || n || '   (want 0)';
  begin
    update public.flats set owner_mobile = '0000000000' where id = 'A101';
    get diagnostics n = row_count;
    res := res || E'\n5 ... tries to change Aakar flat A101       : rows changed ' || n || '   (want 0)';
  exception when others then res := res || E'\n5 ... tries to change Aakar flat A101       : refused (' || sqlerrm || ')';
  end;
  begin
    insert into public.notices (title, content, society_id) values ('wall test', 'x', aakar);
    res := res || E'\n6 ... tries to add a notice INTO Aakar        : ALLOWED (BAD)';
  exception when others then res := res || E'\n6 ... tries to add a notice INTO Aakar        : refused (good): ' || sqlerrm;
  end;

  execute 'reset role';
  delete from public.society_memberships where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.flats;
  res := res || E'\n7 login with NO membership sees flats       : ' || n || '   (want 0: this is why every login needs a membership)';

  execute 'reset role';
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
