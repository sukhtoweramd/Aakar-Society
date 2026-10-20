-- Explicit table permissions for the society app (Supabase change of 30 Oct 2026).
-- From that date Supabase no longer gives new tables automatic access for the website.
-- Existing tables keep their access, so this is a safety net: it writes the same access down explicitly,
-- so a fresh project, a restore, or a table added later keeps working.
-- Run once in Supabase > SQL Editor. Safe to run again. Changes no data.
-- Who sees which ROWS is still decided by the row-level rules (RLS) on each table; this only lets the website reach the tables.
-- Visitors who are not logged in (anon) get nothing.
do $$ declare r record; begin
  for r in select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','v','m','p') loop
    if r.relkind in ('v','m') then
      execute format('grant select on public.%I to authenticated, service_role', r.relname);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', r.relname);
    end if;
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Check: every table and view the app uses should show yes | yes
select c.relname as "table / view",
       case when has_table_privilege('authenticated', c.oid, 'select') then 'yes' else 'NO' end as members_and_committee,
       case when has_table_privilege('anon', c.oid, 'select') then 'OPEN – check' else 'closed' end as not_logged_in
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1;
