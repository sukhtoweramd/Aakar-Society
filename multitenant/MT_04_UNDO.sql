-- Undo of MT_04_SOCIETY_WALL.sql: removes the society wall from every table (the other rules are untouched).
do $$
declare t text;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and policyname = 'society_wall' loop
    execute format('drop policy if exists society_wall on public.%I', t);
  end loop;
end $$;
select 'walls left (expect 0)' as what, count(*)::text as value from pg_policies where schemaname = 'public' and policyname = 'society_wall';
