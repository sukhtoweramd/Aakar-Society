-- MT_05_TEST.sql (Nov 2026) - tries MT_05 on the TEST project only ("aanganone"). Never on Aakar's live database.
-- Adds a second society, then checks: the same area name can exist in two societies but not twice in one; a second society's
-- complaint numbers start again at 0001 while the first society keeps its own series. Ends with a deliberate error so EVERYTHING is
-- rolled back (the red error is expected; read the lines after "RESULT:"). Safe to run any number of times.
do $$
declare
  res text := '';
  aakar constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  other constant uuid := 'b4b4b4b4-0000-4000-8000-000000000002';
  n1 text; n2 text; n3 text; ok boolean;
begin
  insert into public.societies (id, slug, name) values (other, 'zz-test', 'ZZ Test') on conflict do nothing;

  insert into public.booking_areas (society_id, name) values (aakar, 'ZZ-TEST-AREA');
  insert into public.booking_areas (society_id, name) values (other, 'ZZ-TEST-AREA');
  res := res || E'\n1 same area name in two societies             : allowed   (want allowed)';
  begin
    insert into public.booking_areas (society_id, name) values (other, 'ZZ-TEST-AREA');
    res := res || E'\n2 same area name twice in ONE society         : allowed   (want refused)  <-- WRONG';
  exception when unique_violation then
    res := res || E'\n2 same area name twice in ONE society         : refused   (want refused)';
  end;

  insert into public.complaints (society_id, flat_id, description) values (other, 'ZZ1', 'test complaint one') returning complaint_no into n1;
  insert into public.complaints (society_id, flat_id, description) values (other, 'ZZ1', 'test complaint two') returning complaint_no into n2;
  insert into public.complaints (society_id, flat_id, description) values (aakar, 'ZZ1', 'test complaint three') returning complaint_no into n3;
  res := res || E'\n3 second society complaint numbers            : ' || n1 || ' and ' || n2 || '   (want ...0001 and ...0002)';
  ok := n1 like '%/0001' and n2 like '%/0002';
  res := res || E'\n4 first society continues its own series        : ' || n3 || '   (any number: it follows its own last number, not the other society)';
  res := res || E'\n5 overall                                       : ' || case when ok then 'PASS' else 'FAIL' end;

  raise exception E'RESULT:%\n(everything above was rolled back; this red error is expected)', res;
end $$;
