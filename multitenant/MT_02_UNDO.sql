-- Undo of MT_02_SOCIETY_ID.sql: removes society_id (and its index and link) from every table. Data in other columns is untouched.
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'society_id'
              and c.table_name not in ('societies', 'society_memberships')
              and exists (select 1 from information_schema.tables x where x.table_schema = 'public' and x.table_name = c.table_name and x.table_type = 'BASE TABLE')
  loop
    execute format('alter table public.%I drop column society_id', t);
  end loop;
end $$;
select 'tables still having society_id (expect 0)' as what, count(*)::text as value
  from information_schema.columns where table_schema = 'public' and column_name = 'society_id' and table_name not in ('societies', 'society_memberships');
