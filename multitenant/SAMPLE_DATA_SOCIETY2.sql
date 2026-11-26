-- SAMPLE_DATA_SOCIETY2.sql (26 Nov 2026) - FAKE data for a SECOND society on the "aanganone" test copy ONLY. Never run on Aakar's live database
-- (it refuses to run where the first society has real owner names). Run after MT_01 - MT_08 (the keys per society). Safe to run again. Invented names only.
-- Why: so the walls between societies can be tried by hand with real logins. The second society ("Sample Gardens") deliberately REUSES flat ids and tower codes
-- of the first (A101, B203 ...), because that is the clash the walls must survive.
-- It does not create logins. Create them first in the test project (Authentication > Users > Add user, auto-confirm), then put their emails in the two lines
-- marked EDIT below (leave "PUT-EMAIL-HERE" to skip that login). The script sets their role and their society membership.
-- Separate from MT_xx_TEST.sql, which adds and rolls back its own temporary society ('zz-test', another id).
do $$
declare
  first_soc constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  soc2      constant uuid := 'c4c4c4c4-0000-4000-8000-000000000003';
  committee_email constant text := 'PUT-EMAIL-HERE';   -- EDIT: a NEW login that becomes the committee login of the second society
  flat_email      constant text := 'PUT-EMAIL-HERE';   -- EDIT: a NEW login that becomes the flat login of A101 in the second society
  uid uuid;
begin
  if exists (select 1 from public.flats where society_id = first_soc and owner_name is not null and owner_name not like 'SAMPLE%') then
    raise exception 'The first society here has real owner names: this is not the test copy. Nothing was changed.';
  end if;

  insert into public.societies (id, slug, name) values (soc2, 'sample-gardens', 'Sample Gardens') on conflict (id) do nothing;

  insert into public.society_profile (society_id, id, name, full_name, building, address, city)
  values (soc2, 1, 'Sample Gardens', 'Sample Gardens Co-op Housing Society Ltd', 'Sample Gardens', 'Garden Lane', 'Sampleville')
  on conflict (society_id, id) do nothing;

  insert into public.towers (society_id, code, name, has_terrace, sort) values
    (soc2, 'A', 'Tower A', true, 10), (soc2, 'B', 'Tower B', false, 20)
  on conflict (society_id, code) do nothing;

  insert into public.flats (society_id, id, tower, floor, flat_no, bhk, maintenance, owner_name, occupancy, status)
  select soc2, t.code || f || lpad(n::text, 2, '0'), t.code, f, t.code || f || lpad(n::text, 2, '0'), '3BHK', 31000,
         'SAMPLE2 OWNER ' || t.code || f || lpad(n::text, 2, '0'), case when n = 3 then 'tenant' else 'owner' end, 'filled'
    from (values ('A'), ('B')) as t(code), generate_series(1, 3) as f, generate_series(1, 4) as n
  on conflict (society_id, id) do nothing;

  insert into public.members (society_id, flat_id, name, relation, is_head)
  select soc2, id, 'SAMPLE2 HEAD ' || id, 'Self', true from public.flats
   where society_id = soc2 and not exists (select 1 from public.members m where m.society_id = soc2 and m.flat_id = flats.id);

  -- the one-row settings of the new society (defaults); a table that wants more than defaults is only reported
  begin insert into public.app_settings (society_id, id) values (soc2, 1) on conflict (society_id, id) do nothing; exception when others then raise notice 'app_settings: % (add its row by hand)', sqlerrm; end;
  begin insert into public.billing_settings (society_id, id) values (soc2, 1) on conflict (society_id, id) do nothing; exception when others then raise notice 'billing_settings: % (add its row by hand)', sqlerrm; end;

  -- logins
  if committee_email <> 'PUT-EMAIL-HERE' then
    select id into uid from auth.users where lower(email) = lower(committee_email);
    if uid is null then raise notice 'No login with email % - create it first (Authentication > Users).', committee_email;
    else
      update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"committee"}'::jsonb where id = uid;
      delete from public.society_memberships where user_id = uid and society_id <> soc2;      -- a login belongs to one society in this test
      insert into public.society_memberships (user_id, society_id, role) values (uid, soc2, 'committee') on conflict (user_id, society_id) do update set role = 'committee';
    end if;
  end if;
  if flat_email <> 'PUT-EMAIL-HERE' then
    select id into uid from auth.users where lower(email) = lower(flat_email);
    if uid is null then raise notice 'No login with email % - create it first (Authentication > Users).', flat_email;
    else
      update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"resident","flat_id":"A101"}'::jsonb where id = uid;
      delete from public.society_memberships where user_id = uid and society_id <> soc2;
      insert into public.society_memberships (user_id, society_id, role, flat_id) values (uid, soc2, 'flat', 'A101') on conflict (user_id, society_id) do update set role = 'flat', flat_id = 'A101';
    end if;
  end if;
end $$;

-- Check: the second society has 24 flats (same ids A101.. as the first), 24 members, 2 towers, 1 profile; the first society is untouched.
select 'second society: flats (expect 24)' as what, count(*)::text as value from public.flats where society_id = 'c4c4c4c4-0000-4000-8000-000000000003'
union all select 'second society: members (expect 24)', count(*)::text from public.members where society_id = 'c4c4c4c4-0000-4000-8000-000000000003'
union all select 'second society: towers / profile (expect 2 / 1)', (select count(*) from public.towers where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text || ' / ' || (select count(*) from public.society_profile where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text
union all select 'flat ids that exist in BOTH societies (expect 12 or more: the clash is on purpose)', (select count(*) from public.flats a join public.flats b on a.id = b.id and a.society_id <> b.society_id where a.society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text
union all select 'logins of the second society (committee / flat)', (select count(*) filter (where role = 'committee') from public.society_memberships where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text || ' / ' || (select count(*) filter (where role = 'flat') from public.society_memberships where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text;
