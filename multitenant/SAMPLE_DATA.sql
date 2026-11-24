-- SAMPLE_DATA.sql (24 Nov 2026) - FAKE data for the empty "aanganone" test copy ONLY. Never run on Aakar's live database.
-- Run after BASE_TABLES.sql, FLAT_SETUP_TABLES.sql and MT_01 / MT_02. Safe to run again. Invented names, no real residents.
-- One test society for now (the same shape as Aakar: towers A, B, C). A second society needs the step 4 key changes first
-- (see RUN_ORDER.md, "Found while reading"), so it is added then.

insert into public.society_profile (id, name, full_name, building, address, city)
values (1, 'Test Heights', 'Test Heights Co-op Housing Society Ltd', 'Test Heights', 'Sample Road', 'Sampletown')
on conflict (id) do update set name = excluded.name, full_name = excluded.full_name, building = excluded.building,
  address = excluded.address, city = excluded.city, reg_no = null, reg_date = null, address_lines = '{}', public_url = null;
-- (FLAT_SETUP_TABLES.sql had already put Aakar's real profile here; this replaces it with the sample one.)

insert into public.towers (code, name, has_terrace, sort) values
  ('A', 'Tower A', true, 10), ('B', 'Tower B', false, 20), ('C', 'Tower C', false, 30)
on conflict (code) do nothing;

insert into public.flats (id, tower, floor, flat_no, bhk, maintenance, owner_name, occupancy, status)
select t.code || f || lpad(n::text, 2, '0'), t.code, f, t.code || f || lpad(n::text, 2, '0'), '2BHK', 24000,
       'SAMPLE OWNER ' || t.code || f || lpad(n::text, 2, '0'), case when n = 3 then 'tenant' else 'owner' end, 'filled'
  from (values ('A'), ('B'), ('C')) as t(code), generate_series(1, 4) as f, generate_series(1, 4) as n
on conflict (id) do nothing;

insert into public.members (flat_id, name, relation, is_head)
select id, 'SAMPLE HEAD ' || id, 'Self', true from public.flats
 where not exists (select 1 from public.members m where m.flat_id = flats.id);

-- Check: 48 flats, 48 members, 3 towers, 1 profile, every row Aakar-default society (the first society).
select 'flats' as what, count(*)::text as value from public.flats
union all select 'members', count(*)::text from public.members
union all select 'towers', count(*)::text from public.towers
union all select 'profile', count(*)::text from public.society_profile
union all select 'rows in other societies (expect 0)', count(*)::text from public.flats where society_id <> 'a4a4a4a4-0000-4000-8000-000000000001';
