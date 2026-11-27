-- MT_20_TEST.sql (27 Nov 2026) - tries MT_20 on the TEST project only ("aanganone"). It changes nothing for good: it ends with a deliberate error so
-- everything is rolled back (the red error is expected; read the lines after "RESULT:"). NEVER run it on live. Needs MT_20 run.
do $$
declare
  res text := ''; ok boolean := true;
  s_id constant uuid := 'c8c8c8c8-0000-4000-8000-000000000008';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'print_background') then raise exception 'MT_20 has not been run here yet.'; end if;
  insert into public.societies (id, slug, name, status) values (s_id, 'zz-stamp', 'ZZ Stamp', 'active');
  insert into public.billing_settings (society_id, id, bill_prefix, other_prefix, rcpt_prefix, letter_prefix) values (s_id, 1, 'ZZ/', 'ZZ/O/', 'ZZ/R/', 'ZZ/L/');
  update public.billing_settings set stamp_design = '{"color":"red","centre":"building","ring":"short","city":true,"year":false}'::jsonb where society_id = s_id;
  res := res || E'\n1 a stamp design object: saved (want saved)';
  begin update public.billing_settings set stamp_design = '[1,2]'::jsonb where society_id = s_id; res := res || E'\n2 a design that is a list: ACCEPTED (want refused)  <-- WRONG'; ok := false;
  exception when check_violation then res := res || E'\n2 a design that is a list: refused (want refused)'; end;
  begin update public.billing_settings set stamp_design = jsonb_build_object('x', repeat('A', 2500)) where society_id = s_id; res := res || E'\n3 a design over 2000 characters: ACCEPTED (want refused)  <-- WRONG'; ok := false;
  exception when check_violation then res := res || E'\n3 a design over 2000 characters: refused (want refused)'; end;
  update public.billing_settings set print_background = 'data:image/jpeg;base64,' || repeat('A', 1000) where society_id = s_id;
  res := res || E'\n4 a small background picture: saved (want saved)';
  begin update public.billing_settings set print_background = repeat('A', 250001) where society_id = s_id; res := res || E'\n5 a background over 250 000 characters: ACCEPTED (want refused)  <-- WRONG'; ok := false;
  exception when check_violation then res := res || E'\n5 a background over 250 000 characters: refused (want refused)'; end;
  update public.billing_settings set stamp_design = null, print_background = null where society_id = s_id;
  res := res || E'\n6 both cleared (null = the defaults): saved (want saved)';
  res := res || E'\n7 overall: ' || case when ok then 'PASS' else 'FAIL' end;
  raise exception E'RESULT (this error is expected, nothing was changed):%', res;
end $$;
