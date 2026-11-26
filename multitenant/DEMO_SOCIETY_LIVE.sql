-- DEMO_SOCIETY_LIVE.sql (26 Nov 2026) - adds the demo society "Sample Gardens" (address /sample-gardens) to the REAL database, next to Aakar.
-- FAKE data only: invented flats, "Sample Owner A101" style names, no phone numbers, no emails, no real person. Run by hand in the Supabase SQL Editor.
-- Needs MT_01 - MT_17 run (MT_16 included: the login page needs it to find /sample-gardens). Take a fresh backup first (ADMIN > backup) - the script does not touch Aakar, but a backup before any change to the live database is the rule.
--
-- Safety, in this order:
--   * it REFUSES to run if Sample Gardens (this id or this word) already exists - it can never run twice;
--   * every row it adds names the new society; it changes no Aakar row, and it PROVES that: it reads a fingerprint of every Aakar row on every society table before and after,
--     and if anything differs the whole script is rolled back with an error ("nothing was changed");
--   * the committee login of the demo: create ONE login first in Supabase (Authentication > Users > Add user, tick auto-confirm, a strong password) and put its email in the line marked EDIT.
--     The script refuses a login that already has a role or belongs to any society (it will never repurpose a real login) and gives it the committee role in Sample Gardens only.
--     That login then creates the demo flat logins itself through the app (ADMIN > RESIDENT LOGINS), exactly as a real society would.
--   * undo: DEMO_SOCIETY_LIVE_UNDO.sql removes only Sample Gardens.
-- Towers A and C (not B: tower B is the "joined homes" tower of Aakar's login rule, which is one setting for all societies for now).
-- It deliberately REUSES flat ids of Aakar (A101 ...): the walls keep them apart (tested in MT_18).
do $$
declare
  first_soc constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  soc2      constant uuid := 'c4c4c4c4-0000-4000-8000-000000000003';
  committee_email constant text := 'PUT-EMAIL-HERE';   -- EDIT: the new login that becomes the committee login of Sample Gardens
  t text; tabs text[]; before_fp text; after_fp text; fp text; uid uuid; n int; meta jsonb;
begin
  if committee_email = 'PUT-EMAIL-HERE' then raise exception 'Put the demo committee login''s email in the line marked EDIT first. Nothing was changed.'; end if;
  if to_regprocedure('public.require_society(uuid)') is null then raise exception 'Run MT_17_NO_FALLBACK.sql first. Nothing was changed.'; end if;
  if to_regprocedure('public.society_public(text)') is null or to_regprocedure('public.my_society()') is null then raise exception 'Run MT_16_SOCIETY_PUBLIC.sql first (the login page needs it to find /sample-gardens). Nothing was changed.'; end if;
  if soc2 = first_soc then raise exception 'Bad ids. Nothing was changed.'; end if;
  if not exists (select 1 from public.societies where id = first_soc) then raise exception 'The first society is missing here. Nothing was changed.'; end if;
  if exists (select 1 from public.societies where id = soc2 or slug = 'sample-gardens') then
    raise exception 'Sample Gardens already exists here. This script runs only once (use DEMO_SOCIETY_LIVE_UNDO.sql first to remove it). Nothing was changed.';
  end if;

  select array_agg(distinct p.tablename order by p.tablename) into tabs from pg_policies p where p.schemaname = 'public' and p.policyname = 'society_wall';
  if coalesce(array_length(tabs, 1), 0) < 30 then raise exception 'The society wall (MT_04) is not on all tables here. Nothing was changed.'; end if;

  -- the committee login: must exist, be new (no role, no membership)
  select id, raw_app_meta_data into uid, meta from auth.users where lower(email) = lower(committee_email);
  if uid is null then raise exception 'No login with email % - create it first (Authentication > Users > Add user, auto-confirm). Nothing was changed.', committee_email; end if;
  if coalesce(meta ->> 'role', '') <> '' or exists (select 1 from public.society_memberships where user_id = uid) then
    raise exception 'The login % already has a role or belongs to a society: use a NEW login for the demo. Nothing was changed.', committee_email;
  end if;

  -- fingerprint of every row of the first society, before
  before_fp := '';
  foreach t in array tabs loop
    continue when to_regclass('public.' || quote_ident(t)) is null;
    execute format('select coalesce(md5(string_agg(md5(x::text), '''' order by md5(x::text))), ''-'') || '':'' || count(*) from public.%I x where x.society_id = $1', t) into fp using first_soc;
    before_fp := before_fp || t || '=' || fp || ';';
  end loop;

  -- 1. the society
  insert into public.societies (id, slug, name) values (soc2, 'sample-gardens', 'Sample Gardens');
  -- public_url: the address printed on login slips / messages. It must carry the society word, because a flat login ("A-101") is looked up inside the society named in the address.
  insert into public.society_profile (society_id, id, name, full_name, building, address, city, public_url)
  values (soc2, 1, 'Sample Gardens', 'Sample Gardens Co-op Housing Society Ltd', 'Garden Court', 'Garden Lane', 'Sampleville', 'https://aakarsociety.vercel.app/sample-gardens');
  insert into public.towers (society_id, code, name, has_terrace, sort) values (soc2, 'A', 'Tower A', true, 10), (soc2, 'C', 'Tower C', false, 20);

  -- 2. flats (A101 - A304, C101 - C304) and one head of family each
  insert into public.flats (society_id, id, tower, floor, flat_no, bhk, maintenance, owner_name, occupancy, status)
  select soc2, t2.code || fl || lpad(nr::text, 2, '0'), t2.code, fl, t2.code || fl || lpad(nr::text, 2, '0'), '3BHK', 31000,
         'Sample Owner ' || t2.code || fl || lpad(nr::text, 2, '0'), case when nr = 3 then 'tenant' else 'owner' end, 'filled'
    from (values ('A'), ('C')) as t2(code), generate_series(1, 3) as fl, generate_series(1, 4) as nr;
  insert into public.members (society_id, flat_id, name, relation, is_head)
  select soc2, id, 'Sample Head ' || id, 'Self', true from public.flats where society_id = soc2;

  -- 3. the one-row settings of the new society, with the demo's own numbering (not Aakar's AKR/ prefix)
  insert into public.app_settings (society_id, id) values (soc2, 1);
  insert into public.billing_settings (society_id, id, bill_prefix, other_prefix, rcpt_prefix, letter_prefix)
  values (soc2, 1, 'SG/26-27/', 'SG/O/26-27/', 'SGR/26-27/', 'SG/L/');

  -- 4. a little demo content
  insert into public.notices (society_id, title, content, created_by) values
    (soc2, 'Welcome to Sample Gardens', 'This is a demo society. Everything here is sample data.', 'demo'),
    (soc2, 'Water tank cleaning on Sunday', 'Water supply will be off from 9 am to 12 noon (sample notice).', 'demo');
  insert into public.committee_areas (society_id, name) values (soc2, 'Water and plumbing'), (soc2, 'Lifts and security'), (soc2, 'Garden and cleaning');

  -- 5. the committee login of the demo society (this society only)
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"committee"}'::jsonb where id = uid;
  insert into public.society_memberships (user_id, society_id, role) values (uid, soc2, 'committee');

  -- 6. proof that no row of the first society changed (any difference undoes the whole script)
  after_fp := '';
  foreach t in array tabs loop
    continue when to_regclass('public.' || quote_ident(t)) is null;
    execute format('select coalesce(md5(string_agg(md5(x::text), '''' order by md5(x::text))), ''-'') || '':'' || count(*) from public.%I x where x.society_id = $1', t) into fp using first_soc;
    after_fp := after_fp || t || '=' || fp || ';';
  end loop;
  if after_fp <> before_fp then raise exception 'A row of the first society would have changed. The whole script was rolled back; nothing was changed. Send me this message.'; end if;
  raise notice 'Sample Gardens added; the first society is byte-for-byte unchanged on % tables.', array_length(tabs, 1);
end $$;

-- Check
select 'Sample Gardens: flats / members (expect 24 / 24)' as what,
       (select count(*) from public.flats where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text || ' / ' || (select count(*) from public.members where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text as value
union all select 'Sample Gardens: towers / profile / notices / areas (expect 2 / 1 / 2 / 3)',
       (select count(*) from public.towers where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text || ' / ' || (select count(*) from public.society_profile where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text
       || ' / ' || (select count(*) from public.notices where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text || ' / ' || (select count(*) from public.committee_areas where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text
union all select 'logins of Sample Gardens (expect 1 committee)', (select count(*) from public.society_memberships where society_id = 'c4c4c4c4-0000-4000-8000-000000000003' and role = 'committee')::text
union all select 'societies on this database (expect 2: aakar, sample-gardens)', (select string_agg(slug, ', ' order by slug) from public.societies);
