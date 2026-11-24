-- MT_07_TEST.sql (Nov 2026) - tries MT_07 on the TEST project only ("aanganone"). Never on Aakar's live database.
-- Gives a second society its own flat A101 (the first society already has one), checks that links to flats cannot cross societies,
-- that a tower of the second society can be deleted although the first society's flats use the same tower code, and that saving a nominee
-- (which writes nomination_status through a trigger) works for both societies. Ends with a deliberate error so EVERYTHING is rolled back
-- (the red error is expected; read the lines after "RESULT:"). Safe to run any number of times.
do $$
declare
  res text := ''; ok boolean := true; n int;
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
begin
  if not exists (select 1 from public.flats where society_id = aakar and id = 'A101') then
    raise exception 'The first society has no flat A101 here (load SAMPLE_DATA.sql, RUN_ORDER.md).';
  end if;
  if exists (select 1 from public.flats where society_id = aakar and id = 'ZZ-NOPE') then raise exception 'unexpected flat'; end if;
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;

  insert into public.flats (society_id, id) values (other, 'A101');
  res := res || E'\n1 the second society gets its own flat A101        : allowed   (want allowed)';
  begin
    insert into public.flats (society_id, id) values (other, 'A101');
    res := res || E'\n2 the same flat id twice in ONE society            : allowed   (want refused)  <-- WRONG'; ok := false;
  exception when unique_violation then
    res := res || E'\n2 the same flat id twice in ONE society            : refused   (want refused)';
  end;

  insert into public.members (society_id, flat_id, name) values (other, 'A101', 'ZZ Test member');
  res := res || E'\n3 a member of the second society linked to its A101 : allowed   (want allowed)';
  insert into public.members (society_id, flat_id, name) values (aakar, 'A101', 'ZZ Test member');
  res := res || E'\n4 a member of the first society linked to its A101  : allowed   (want allowed)';
  begin
    insert into public.members (society_id, flat_id, name) values (other, 'A102', 'ZZ Test member');
    res := res || E'\n5 second society member linked to a flat that only the first society has : allowed   (want refused)  <-- WRONG'; ok := false;
  exception when foreign_key_violation then
    res := res || E'\n5 second society member linked to a flat that only the first society has : refused   (want refused)';
  end;

  insert into public.towers (society_id, code, name) values (other, 'A', 'ZZ Tower A');
  begin
    insert into public.towers (society_id, code, name) values (other, 'A', 'ZZ Tower A again');
    res := res || E'\n6 the same tower code twice in ONE society          : allowed   (want refused)  <-- WRONG'; ok := false;
  exception when unique_violation then
    res := res || E'\n6 the same tower code twice in ONE society          : refused   (want refused)';
  end;
  begin
    delete from public.towers where society_id = other and code = 'A';
    res := res || E'\n7 delete the second society''s tower A (its flats do not use it; the first society''s flats do) : allowed   (want allowed)';
  exception when others then
    res := res || E'\n7 delete the second society''s tower A : refused (' || sqlerrm || ')   (want allowed)  <-- WRONG'; ok := false;
  end;

  insert into public.nominees (society_id, flat_id, name, relation, dob) values (other, 'A101', 'Zed Test', 'Son', date '2000-01-01');
  insert into public.nominees (society_id, flat_id, name, relation, dob) values (other, 'A101', 'Zee Test', 'Daughter', date '2001-01-01');
  select count(*) into n from public.nomination_status where society_id = other and flat_id = 'A101';
  res := res || E'\n8 two nominees saved for the second society: its nomination_status rows for A101 : ' || n || '   (want 1)';
  if n <> 1 then ok := false; end if;
  select count(*) into n from public.nomination_status where society_id = aakar and flat_id = 'A101' and declared_by is not null and declared_at > now() - interval '1 minute';
  res := res || E'\n9 the first society''s nomination row for A101 was not touched : ' || case when n = 0 then 'not touched' else 'CHANGED' end || '   (want not touched)';
  if n <> 0 then ok := false; end if;

  res := res || E'\n10 overall                                           : ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT:%\n(everything above was rolled back; this red error is expected)', res;
end $$;
