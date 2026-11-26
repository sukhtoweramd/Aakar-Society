-- MT_18_WALLS_TEST.sql (Nov 2026) - step 4e: a login of ANOTHER society tries to cross the society wall. TEST project only ("aanganone"). NEVER on live.
-- Changes nothing for good: it ends with a deliberate error, so EVERYTHING it does is rolled back (the red error is expected; read the lines after "RESULT:").
-- It makes a new, empty society ("zz-test"), moves the first committee login into it (a real "authenticated" database user, the most powerful kind of login),
-- and then, on EVERY table that has the society wall (found from the database, not typed in):
--   A  looks at the first society's rows            -> must see 0
--   B  tries to change them                          -> must change 0 rows (or be refused)
--   C  tries to delete them                          -> must delete 0 rows (or be refused)
--   D  tries to INSERT a copy of one of them (naming the first society) -> must be refused by the row rule
-- then: E a login with no membership sees nothing anywhere; F the "anon" (not logged in) role gets nothing; J the wall rule is the same, restrictive and complete on every table (also those with no rows to try); G the three directory views show nothing of the first society;
-- H functions that run with owner rights give nothing of the first society; I a forged "active society" in the login does not work.
-- Needs the first society with data and one committee login (the sample data of the test project) and MT_17 run. A line marked BAD fails the test; a line marked UNCLEAR is
-- an insert that was stopped by something other than the row rule or a duplicate key (a trigger, a check; read it: it is not a hole by itself, but send it to me).
do $$
declare
  uid uuid; res text := ''; bad int := 0; unclear int := 0; checked int := 0; n bigint; e text; t text; jrow jsonb; kind text;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001'; other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  tabs text[]; inserted int := 0; norows int := 0; refused int := 0; fn text; rs boolean; hits int; vw text; old_meta jsonb;
begin
  if to_regprocedure('public.require_society(uuid)') is null then raise exception 'MT_17 has not been run here yet.'; end if;
  select u.id into uid from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1;
  if uid is null then raise exception 'No committee login found (RUN_ORDER.md, step 2a).'; end if;
  if not exists (select 1 from public.society_memberships where user_id = uid and society_id = aakar) then raise exception 'The committee login must belong to the first society.'; end if;
  select array_agg(distinct p.tablename order by p.tablename) into tabs from pg_policies p where p.schemaname = 'public' and p.policyname = 'society_wall';
  if coalesce(array_length(tabs, 1), 0) < 30 then raise exception 'Only % tables have the society wall (MT_04 expected about 39).', coalesce(array_length(tabs, 1), 0); end if;

  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;
  update public.society_memberships set society_id = other where user_id = uid;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee'))::text, true);
  res := res || E'\nlogin moved to a new empty society; ' || array_length(tabs, 1) || ' tables have the wall';

  -- A - D on every walled table -----------------------------------------------------------------------------------------------------------
  foreach t in array tabs loop
    continue when to_regclass('public.' || quote_ident(t)) is null;
    checked := checked + 1;
    -- one real row of the first society to copy (read as the owner, before the login's rights apply)
    execute 'reset role';
    execute format('select to_jsonb(x) from public.%I x where x.society_id = $1 limit 1', t) into jrow using aakar;
    execute 'set local role authenticated';
    -- A
    begin execute format('select count(*) from public.%I where society_id = $1', t) into n using aakar; e := ''; exception when others then n := 0; e := sqlerrm; end;
    if n <> 0 then bad := bad + 1; res := res || E'\nBAD A  ' || t || ': the other society SEES ' || n || ' row(s) of the first society'; end if;
    -- B
    begin execute format('update public.%I set society_id = society_id where society_id = $1', t) using aakar; get diagnostics n = row_count; e := '';
    exception when others then n := 0; end;
    if n <> 0 then bad := bad + 1; res := res || E'\nBAD B  ' || t || ': the other society CHANGED ' || n || ' row(s) of the first society'; end if;
    -- C
    begin execute format('delete from public.%I where society_id = $1', t) using aakar; get diagnostics n = row_count; e := '';
    exception when others then n := 0; end;
    if n <> 0 then bad := bad + 1; res := res || E'\nBAD C  ' || t || ': the other society DELETED ' || n || ' row(s) of the first society'; end if;
    -- D
    if jrow is null then norows := norows + 1;
    else
      begin
        execute format('insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).*', t, t) using jrow;
        inserted := inserted + 1; bad := bad + 1; res := res || E'\nBAD D  ' || t || ': the other society INSERTED a row into the first society';
      exception when others then
        if sqlerrm ilike '%row-level security%' then refused := refused + 1;
        elsif sqlstate = '23505' then
          -- a duplicate key can only be reported AFTER the row rule has let the row through: so the wall did not stop it
          bad := bad + 1; res := res || E'\nBAD D  ' || t || ': the row rule did NOT stop the insert into the first society (only a duplicate key did)';
        else unclear := unclear + 1; res := res || E'\nUNCLEAR D ' || t || ': insert stopped by "' || left(sqlerrm, 110) || '"'; end if;
      end;
    end if;
  end loop;
  execute 'reset role';
  res := res || E'\nA-D on ' || checked || ' tables: insert into the first society refused by the row rule on ' || refused || ', stopped by something else on ' || unclear || ', nothing to copy on ' || norows;

  -- E - a login with no membership at all ------------------------------------------------------------------------------------------------------
  delete from public.society_memberships where user_id = uid;
  hits := 0;
  execute 'set local role authenticated';
  foreach t in array tabs loop
    continue when to_regclass('public.' || quote_ident(t)) is null;
    begin execute format('select count(*) from public.%I', t) into n; exception when others then n := 0; end;
    if n <> 0 then hits := hits + 1; bad := bad + 1; res := res || E'\nBAD E  ' || t || ': a login with NO membership sees ' || n || ' row(s)'; end if;
  end loop;
  execute 'reset role';
  res := res || E'\nE login with no membership: tables where it sees anything: ' || hits || ' (want 0)';

  -- F - anon (not logged in) --------------------------------------------------------------------------------------------------------------------
  hits := 0;
  execute 'set local role anon';
  foreach t in array tabs loop
    continue when to_regclass('public.' || quote_ident(t)) is null;
    begin execute format('select count(*) from public.%I', t) into n; exception when others then n := 0; end;
    if n <> 0 then hits := hits + 1; bad := bad + 1; res := res || E'\nBAD F  ' || t || ': NOT logged in, sees ' || n || ' row(s)'; end if;
  end loop;
  execute 'reset role';
  res := res || E'\nF not logged in (anon): tables where it sees anything: ' || hits || ' (want 0)';

  -- J - the wall itself, on EVERY table including those with no rows to try it on: same rule text, restrictive, for all commands, row security on, nothing for anon
  declare
    ref_q text; ref_c text; q text; c text; rx boolean; anon_ok boolean; pol record; anon_n int := 0;
  begin
    hits := 0;
    foreach t in array tabs loop
      continue when to_regclass('public.' || quote_ident(t)) is null;
      select p.qual, p.with_check, p.permissive, p.cmd, p.roles::text into pol from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'society_wall';
      q := regexp_replace(coalesce(pol.qual, ''), '\s+', '', 'g'); c := regexp_replace(coalesce(pol.with_check, pol.qual, ''), '\s+', '', 'g');   -- no separate check = the USING rule is used for new rows too
      if ref_q is null then ref_q := q; ref_c := c; end if;
      select c2.relrowsecurity into rx from pg_class c2 where c2.oid = to_regclass('public.' || quote_ident(t));
      anon_ok := has_table_privilege('anon', 'public.' || quote_ident(t), 'select') or has_table_privilege('anon', 'public.' || quote_ident(t), 'insert')
              or has_table_privilege('anon', 'public.' || quote_ident(t), 'update') or has_table_privilege('anon', 'public.' || quote_ident(t), 'delete');
      if anon_ok then anon_n := anon_n + 1; end if;
      if pol.permissive is distinct from 'RESTRICTIVE' or pol.cmd is distinct from 'ALL' or q <> ref_q or c <> ref_c or q not like '%society_id%' or q not like '%active_society%'
         or c not like '%society_id%' or c not like '%active_society%' or rx is not true then
        hits := hits + 1; bad := bad + 1;
        res := res || E'\nBAD J  ' || t || ': wall differs (permissive=' || coalesce(pol.permissive, '?') || ', cmd=' || coalesce(pol.cmd, '?') || ', row security on=' || coalesce(rx::text, '?') || ', same rule text=' || (q = ref_q and c = ref_c)::text || ')';
      end if;
    end loop;
    res := res || E'\nJ wall rule on all ' || array_length(tabs, 1) || ' tables identical, restrictive, for all commands, row security on: tables that differ: ' || hits || ' (want 0); tables where anon still holds a table privilege (blocked by row security anyway, see F; info): ' || anon_n || '; the rule is: ' || left(coalesce(ref_q, '?'), 90);
  end;

  -- put the login into the empty society again for G - I
  insert into public.society_memberships (user_id, society_id, role) values (uid, other, 'committee');

  -- G - the three directory views ---------------------------------------------------------------------------------------------------------------------
  execute 'set local role authenticated';
  foreach vw in array array['flat_directory', 'member_directory', 'business_directory'] loop
    if to_regclass('public.' || vw) is null then res := res || E'\nG ' || vw || ': view not found (skipped)'; continue; end if;
    execute format('select count(*) from public.%I', vw) into n;
    if n <> 0 then bad := bad + 1; res := res || E'\nBAD G  ' || vw || ': shows ' || n || ' row(s) to a login of an empty society'; end if;
  end loop;
  execute 'reset role';
  res := res || E'\nG directory views checked (want nothing shown)';

  -- H - functions that run with owner rights, called as the empty society's committee login --------------------------------------------------
  execute 'set local role authenticated';
  foreach fn in array array['committee_people', 'flat_people_counts', 'my_action_points', 'my_committee_meetings'] loop
    if to_regprocedure('public.' || fn || '()') is null then res := res || E'\nH ' || fn || ': not found with no arguments (skipped)'; continue; end if;
    select p.proretset into rs from pg_proc p where p.oid = to_regprocedure('public.' || fn || '()');
    begin
      if rs then execute format('select count(*) from public.%I()', fn) into n;
        if n <> 0 then bad := bad + 1; res := res || E'\nBAD H  ' || fn || '(): returned ' || n || ' row(s) for the empty society'; end if;
      else execute format('select public.%I()::text', fn) into e;
        res := res || E'\nH ' || fn || '() returned: ' || coalesce(left(e, 80), 'null') || ' (info)'; end if;
    exception when others then res := res || E'\nH ' || fn || '(): refused "' || left(sqlerrm, 70) || '" (fine)'; end;
  end loop;
  execute 'reset role';

  -- I - a forged "active society" claim for a society the login does not belong to --------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid::text, 'app_metadata', jsonb_build_object('role', 'committee', 'active_society', aakar::text))::text, true);
  execute 'set local role authenticated';
  n := (select count(*) from public.flats where society_id = aakar);
  e := (select public.active_society()::text);
  execute 'reset role';
  res := res || E'\nI claim "active society = first society" without belonging to it: active_society() = ' || coalesce(e, 'null') || ', first society flats seen: ' || n || ' (want the empty society and 0)';
  if n <> 0 or e is distinct from other::text then bad := bad + 1; res := res || E'  <-- BAD'; end if;

  res := res || E'\noverall: ' || case when bad = 0 then 'PASS' else 'FAIL (' || bad || ' BAD)' end || case when unclear > 0 then ' - ' || unclear || ' UNCLEAR line(s) to read' else '' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
