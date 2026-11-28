-- LG_01_TEST.sql (28 Nov 2026) - tries LG_01 on the TEST project only ("aanganone"). NEVER on live. Needs MT_01 - MT_20 and LG_01 run.
-- It pretends to be the first committee login, makes a few test documents, tries to accept them (and to cheat), then ends with a deliberate error so
-- EVERYTHING is rolled back: the red error is expected, read the lines after "RESULT:". Safe to run any number of times.
do $$
declare
  uid uuid; res text := ''; ok boolean := true; msg text; n bigint; j jsonb;
  s_other constant uuid := 'd8d8d8d8-0000-4000-8000-000000000008';
  h constant text := repeat('a', 64);
begin
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found on this project.'; end if;
  if to_regclass('public.legal_acceptances') is null then raise exception 'Run LG_01_LEGAL_TABLES.sql first.'; end if;
  if not exists (select 1 from public.society_memberships m where m.user_id = uid) then raise exception 'The committee login has no society membership.'; end if;

  insert into public.legal_documents (doc_key, version, status, title, audience, required_at, sha256) values
    ('zz-pub', 1, 'published', 'ZZ public', array['society_admin', 'committee', 'flat', 'tenant'], 'first_login', h),
    ('zz-draft', 1, 'draft', 'ZZ draft', array['society_admin', 'committee', 'flat', 'tenant'], 'first_login', h),
    ('zz-committee', 1, 'published', 'ZZ committee only', array['society_admin', 'committee'], 'onboarding', h);

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
  execute 'set local role authenticated';

  begin perform public.accept_legal_document('zz-draft', 1); res := res || E'\n1 accept a DRAFT: accepted (want refused)  <-- WRONG'; ok := false;
  exception when others then get stacked diagnostics msg = message_text; res := res || E'\n1 accept a draft: refused "' || msg || '" (want refused)'; end;

  perform public.accept_legal_document('zz-pub', 1);
  perform public.accept_legal_document('zz-pub', 1);
  select count(*) into n from public.legal_acceptances where doc_key = 'zz-pub';
  res := res || E'\n2 accept a published document twice: rows = ' || n || ' (want 1)'; if n <> 1 then ok := false; end if;

  begin perform public.accept_legal_document('zz-nope', 1); res := res || E'\n3 unknown document: accepted (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n3 unknown document: refused (want refused)'; end;

  j := public.my_legal_status();
  res := res || E'\n4 status lists zz-pub as accepted: ' || (select coalesce(bool_or((e ->> 'accepted')::boolean), false) from jsonb_array_elements(j) e where e ->> 'doc_key' = 'zz-pub') || ' (want true; zz-draft must not be listed: '
         || (not exists (select 1 from jsonb_array_elements(j) e where e ->> 'doc_key' = 'zz-draft')) || ')';
  if exists (select 1 from jsonb_array_elements(j) e where e ->> 'doc_key' = 'zz-draft') then ok := false; end if;

  begin insert into public.legal_acceptances (doc_key, version, doc_sha256, role) values ('zz-pub', 1, h, 'committee'); res := res || E'\n5 direct insert as a login: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n5 direct insert as a login: refused (want refused)'; end;
  begin update public.legal_acceptances set doc_sha256 = h; get diagnostics n = row_count; if n > 0 then res := res || E'\n6 update as a login: changed ' || n || ' rows (want 0 / refused)  <-- WRONG'; ok := false; else res := res || E'\n6 update as a login: 0 rows (want 0 / refused)'; end if;
  exception when others then res := res || E'\n6 update as a login: refused (want 0 / refused)'; end;
  begin delete from public.legal_acceptances; get diagnostics n = row_count; if n > 0 then res := res || E'\n7 delete as a login: deleted ' || n || ' (want 0 / refused)  <-- WRONG'; ok := false; else res := res || E'\n7 delete as a login: 0 rows (want 0 / refused)'; end if;
  exception when others then res := res || E'\n7 delete as a login: refused (want 0 / refused)'; end;

  execute 'reset role';
  begin update public.legal_acceptances set doc_sha256 = h; res := res || E'\n8 update even as the SQL Editor: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n8 update even as the SQL Editor: refused (want refused)'; end;
  begin update public.legal_documents set sha256 = repeat('b', 64) where doc_key = 'zz-pub' and version = 1; res := res || E'\n9 edit a published document: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n9 edit a published document: refused (want refused)'; end;

  -- a newer version
  insert into public.legal_documents (doc_key, version, status, title, audience, required_at, sha256) values ('zz-pub', 2, 'published', 'ZZ public v2', array['society_admin', 'committee', 'flat', 'tenant'], 'first_login', repeat('c', 64));
  execute 'set local role authenticated';
  begin perform public.accept_legal_document('zz-pub', 1); res := res || E'\n10 accept an OLD version: accepted (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n10 accept an old version: refused (want refused)'; end;
  res := res || E'\n11 status now asks for version 2, not yet accepted: ' || (select coalesce(bool_and(not (e ->> 'accepted')::boolean and (e ->> 'version')::int = 2), false) from jsonb_array_elements(public.my_legal_status()) e where e ->> 'doc_key' = 'zz-pub') || ' (want true)';
  if not (select coalesce(bool_and(not (e ->> 'accepted')::boolean and (e ->> 'version')::int = 2), false) from jsonb_array_elements(public.my_legal_status()) e where e ->> 'doc_key' = 'zz-pub') then ok := false; end if;

  -- wrong role
  execute 'reset role';
  update public.society_memberships set role = 'flat' where user_id = uid;
  execute 'set local role authenticated';
  begin perform public.accept_legal_document('zz-committee', 1); res := res || E'\n12 a FLAT login accepts a committee-only document: accepted (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n12 a flat login and a committee-only document: refused (want refused)'; end;

  -- another society cannot see the first society's records
  execute 'reset role';
  insert into public.societies (id, slug, name, status) values (s_other, 'zz-legal', 'ZZ Legal', 'active');
  update public.society_memberships set society_id = s_other, role = 'society_admin' where user_id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.legal_acceptances;
  res := res || E'\n13 same login, now in ANOTHER society, reads acceptances: ' || n || ' rows (want 0)'; if n <> 0 then ok := false; end if;

  -- a login with no society (like the product owner)
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid()::text)::text, true);
  res := res || E'\n14 a login with no society: status = ' || public.my_legal_status()::text || ' (want [])'; if public.my_legal_status() <> '[]'::jsonb then ok := false; end if;
  begin perform public.accept_legal_document('zz-pub', 2); res := res || E'\n15 a login with no society accepts: accepted (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n15 a login with no society accepts: refused (want refused)'; end;

  -- not signed in at all
  execute 'reset role';
  execute 'set local role anon';
  begin perform count(*) from public.legal_documents; res := res || E'\n16 anon reads the registry: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n16 anon reads the registry: refused (want refused)'; end;
  begin perform public.accept_legal_document('zz-pub', 2); res := res || E'\n17 anon accepts: ALLOWED (want refused)  <-- WRONG'; ok := false;
  exception when others then res := res || E'\n17 anon accepts: refused (want refused)'; end;
  execute 'reset role';

  res := res || E'\n18 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
