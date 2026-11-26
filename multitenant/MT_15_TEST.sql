-- MT_15_TEST.sql (Nov 2026) - tries MT_15 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on Aakar's live database (it moves the
-- committee login to another society, replaces is_main_admin() and can_assign_areas() with "always yes" for the length of the test, adds flats, tenant logins,
-- areas, letter formats and requests; rolled back, but there is no reason to do that where the data matters).
-- It gives a SECOND society flats with the same ids (A101, Q101), a flat on the committee, a tenant login, an area and a letter format, then:
--   part 1  the committee login of the first society chooses area holders (a flat of the OTHER society with the same id must not count as on the committee),
--           asks for another society's letter format, and moves a tenant out (the other society's tenant login of the same flat id must stay on);
--   part 2  the same login moved to the second society chooses an area holder that exists only in the first society.
-- Needs the first society to have flat A101 and one committee login (the sample data of the test project), and MT_15 run.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; e text; n int; t text; old_meta jsonb;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  area_a uuid := gen_random_uuid(); area_b uuid := gen_random_uuid(); tpl_a uuid := gen_random_uuid(); tpl_b uuid := gen_random_uuid();
  act_a boolean; act_b boolean; det jsonb;
begin
  if pg_get_functiondef('public.tenant_moved_out()'::regprocedure) !~ 'new\.society_id' then raise exception 'MT_15 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then raise exception 'The first society needs flat A101 (load SAMPLE_DATA.sql).'; end if;
  select raw_app_meta_data into old_meta from auth.users where id = uid;

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);

  begin
    -- who may choose area people is not what is tested here: both rights are "yes" for this test (rolled back with everything else)
    execute 'create or replace function public.is_main_admin() returns boolean language sql stable security definer set search_path = public as $f$ select true $f$';
    execute 'create or replace function public.can_assign_areas() returns boolean language sql stable security definer set search_path = public as $f$ select true $f$';
    insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
    -- the SAME flat ids in both societies; Q101 is on the committee only in the second, Q102 only in the first
    insert into public.flats (society_id, id, tower, floor, flat_no, owner_name, is_committee) values
      (other, 'A101', 'A', 1, 'A101', 'ZZ OWNER 101', false), (other, 'Q101', 'Q', 1, 'Q101', 'ZZ Q101', true),
      (aakar, 'Q101', 'Q', 1, 'Q101', 'AAKAR Q101', false), (aakar, 'Q102', 'Q', 1, 'Q102', 'AAKAR Q102', true);
    update public.flats set occupancy = 'tenant' where id = 'A101' and society_id in (aakar, other);
    insert into public.flat_tenant_logins (society_id, user_id, flat_id, active) values (aakar, gen_random_uuid(), 'A101', true), (other, gen_random_uuid(), 'A101', true);
    -- areas and letter formats (areas as the SQL Editor would insert them: no login, so the area guard does not ask for anything)
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    insert into public.committee_areas (society_id, id, name) values (aakar, area_a, 'ZZ AREA A'), (other, area_b, 'ZZ AREA B');
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
    insert into public.letter_templates (society_id, id, name, kind, subject, body, member_fields) values
      (aakar, tpl_a, 'ZZ FORMAT A', 'general', 's', 'b', array['zz_own_field']), (other, tpl_b, 'ZZ FORMAT B', 'general', 's', 'b', array['zz_secret_field']);
  exception when others then
    raise exception 'MT_15_TEST setup failed: % (%)', sqlerrm, sqlstate;
  end;

  -- 1. the committee login of the FIRST society -----------------------------------------------------------------------------------------
  execute 'set local role authenticated';
  begin update public.committee_areas set holder_flat = 'Q101' where id = area_a; e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n1 area holder Q101 (on the committee only in the SECOND society): ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e not like 'Not on the committee: Q101%' then ok := false; end if;
  begin update public.committee_areas set holder_flat = 'Q102' where id = area_a; e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n2 area holder Q102 (on the committee in our society): ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
  if e <> '' then ok := false; end if;
  execute 'reset role';
  -- a letter request naming the OTHER society's format: nothing may be asked, nothing leaks
  begin
    insert into public.letter_requests (society_id, flat_id, letter_type, template_id, details) values (aakar, 'A101', 'ZZ letter', tpl_b, '{}') returning details into det;
    e := '';
  exception when others then e := sqlerrm; end;
  res := res || E'\n3 letter request naming the SECOND society''s format: ' || case when e = '' then 'accepted, nothing asked (want this)' else 'ERROR "' || e || '"  <-- WRONG (this would tell which fields that format asks for)' end;
  if e <> '' then ok := false; end if;
  begin
    insert into public.letter_requests (society_id, flat_id, letter_type, template_id, details) values (aakar, 'A101', 'ZZ letter', tpl_a, '{}');
    e := '';
  exception when others then e := sqlerrm; end;
  res := res || E'\n4 letter request naming our own format without its field: ' || case when e = '' then 'ACCEPTED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e is distinct from 'Please fill in: zz own field' then ok := false; end if;
  -- tenant moves out of A101 in the FIRST society
  execute 'set local role authenticated';
  begin update public.flats set occupancy = 'owner' where society_id = aakar and id = 'A101'; e := ''; exception when others then e := sqlerrm; end;
  execute 'reset role';
  select bool_or(active) filter (where society_id = aakar), bool_or(active) filter (where society_id = other) into act_a, act_b from public.flat_tenant_logins where flat_id = 'A101';
  res := res || E'\n5 tenant moved out of A101 (first society): its own tenant login active = ' || coalesce(act_a::text, '?') || ' (want false), the SECOND society''s A101 tenant login active = ' || coalesce(act_b::text, '?') || ' (want true)' || case when e <> '' then '; error ' || e else '' end;
  if e <> '' or act_a is distinct from false or act_b is distinct from true then ok := false; end if;

  -- 2. the same login, now in the SECOND society ----------------------------------------------------------------------------------------
  update public.society_memberships set society_id = other where user_id = uid;
  execute 'set local role authenticated';
  begin update public.committee_areas set backup_flats = array['Q102'] where id = area_b; e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n6 area BACKUP Q102 (on the committee only in the FIRST society): ' || case when e = '' then 'ALLOWED (want refused)  <-- WRONG' else 'refused "' || e || '"' end;
  if e not like 'Not on the committee: Q102%' then ok := false; end if;
  begin update public.committee_areas set backup_flats = array['Q101'] where id = area_b; e := ''; exception when others then e := sqlerrm; end;
  res := res || E'\n7 area BACKUP Q101 (on the committee in this society): ' || coalesce(nullif(e, ''), 'done') || ' (want done)';
  if e <> '' then ok := false; end if;
  execute 'reset role';

  res := res || E'\n8 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
