-- DEMO_SOCIETY_LIVE_UNDO.sql (26 Nov 2026) - removes the demo society "Sample Gardens" (and nothing else) from the real database.
-- Every delete below names Sample Gardens' own id; it refuses if that id is the first society or the word is not sample-gardens. Safe to run again (nothing to do the second time).
-- It also takes the committee role off the demo login and removes its membership; delete the demo login itself in Supabase (Authentication > Users) and any demo flat logins
-- the demo committee made (a101@sample-gardens.flats.aakarsociety.app ...) the same way.
do $$
declare
  first_soc constant uuid := 'a4a4a4a4-0000-4000-8000-000000000001';
  soc2      constant uuid := 'c4c4c4c4-0000-4000-8000-000000000003';
  t text; tabs text[]; pass int := 0; left_rows int; removed int; n int; progress boolean; uid uuid;
begin
  if soc2 = first_soc then raise exception 'Bad ids. Nothing was changed.'; end if;
  if not exists (select 1 from public.societies where id = soc2) then raise notice 'Sample Gardens is not here; nothing to remove.'; return; end if;
  if not exists (select 1 from public.societies where id = soc2 and slug = 'sample-gardens') then raise exception 'That id is not Sample Gardens. Nothing was changed.'; end if;
  select array_agg(distinct p.tablename order by p.tablename) into tabs from pg_policies p where p.schemaname = 'public' and p.policyname = 'society_wall';
  -- children before parents: repeat until nothing is left (a table blocked by a foreign key is tried again after the others)
  loop
    pass := pass + 1; progress := false; left_rows := 0;
    foreach t in array tabs loop
      continue when to_regclass('public.' || quote_ident(t)) is null;
      begin
        execute format('delete from public.%I where society_id = $1', t) using soc2;
        get diagnostics n = row_count; if n > 0 then progress := true; end if;
      exception when foreign_key_violation then left_rows := left_rows + 1; end;
    end loop;
    exit when left_rows = 0 or pass >= 8;
    if not progress and pass >= 3 then exit; end if;
  end loop;
  if left_rows > 0 then raise exception 'Some Sample Gardens rows are still held by others after % passes. Nothing was changed (rolled back). Send me this message.', pass; end if;
  for uid in select user_id from public.society_memberships where society_id = soc2 loop
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' - 'flat_id' - 'tenant_flat' where id = uid and not exists (select 1 from public.society_memberships m where m.user_id = uid and m.society_id <> soc2);
  end loop;
  delete from public.society_memberships where society_id = soc2;
  delete from public.societies where id = soc2 and slug = 'sample-gardens';
  raise notice 'Sample Gardens removed.';
end $$;

-- Check
select 'Sample Gardens left (expect 0)' as what, (select count(*) from public.societies where slug = 'sample-gardens')::text as value
union all select 'rows of it left in flats / members / notices (expect 0 / 0 / 0)',
       (select count(*) from public.flats where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text || ' / ' || (select count(*) from public.members where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text
       || ' / ' || (select count(*) from public.notices where society_id = 'c4c4c4c4-0000-4000-8000-000000000003')::text
union all select 'societies left (expect aakar)', (select string_agg(slug, ', ' order by slug) from public.societies);
