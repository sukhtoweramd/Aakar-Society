-- MT_19_TEST.sql (27 Nov 2026) - tries MT_19 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- everything is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on live. Needs MT_16 and MT_19 run.
do $$
declare
  res text := ''; ok boolean := true; j jsonb;
  s_id constant uuid := 'c7c7c7c7-0000-4000-8000-000000000007';
  tiny constant text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'society_profile' and column_name = 'logo_image') then raise exception 'MT_19 has not been run here yet.'; end if;
  insert into public.societies (id, slug, name, status) values (s_id, 'zz-logo', 'ZZ Logo', 'active');
  insert into public.society_profile (society_id, id, name, full_name) values (s_id, 1, 'ZZ Logo', 'ZZ LOGO HOUSING SOCIETY');
  execute 'set local role anon';
  j := public.society_public('zz-logo');
  res := res || E'\n1 society without a logo, asked as the login page: ' || coalesce(j::text, 'nothing') || ' (want slug + name only)';
  if j is null or (select count(*) from jsonb_object_keys(j)) <> 2 then ok := false; end if;
  execute 'reset role';
  update public.society_profile set logo_image = tiny where society_id = s_id;
  execute 'set local role anon';
  j := public.society_public('zz-logo');
  res := res || E'\n2 society with a logo: keys = ' || coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(j) k), 'nothing') || ' (want logo,name,slug)';
  if j is null or j ->> 'logo' is distinct from tiny or (select count(*) from jsonb_object_keys(j)) <> 3 then ok := false; end if;
  execute 'reset role';
  begin
    update public.society_profile set logo_image = repeat('A', 120001) where society_id = s_id;
    res := res || E'\n3 a logo over the limit: ACCEPTED (want refused)  <-- WRONG'; ok := false;
  exception when check_violation then res := res || E'\n3 a logo over the limit: refused (want refused)'; end;
  update public.societies set status = 'suspended' where id = s_id;
  execute 'set local role anon';
  j := public.society_public('zz-logo');
  res := res || E'\n4 a paused society: ' || coalesce(j::text, 'nothing') || ' (want nothing)';
  if j is not null then ok := false; end if;
  execute 'reset role';
  res := res || E'\n5 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
