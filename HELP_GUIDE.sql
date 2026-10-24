-- HELP assistant: the help guide kept in the database, so the committee can edit it in ADMIN → HELP GUIDE.
-- Run once in Supabase > SQL Editor. Safe to run again. Changes no other data.
-- Until a guide is saved here, the app uses its built-in guide (content/help-kb.md).

create table if not exists public.help_guide (
  id integer primary key default 1 check (id = 1),     -- one guide only
  content text not null check (length(content) between 50 and 60000),
  updated_by text, updated_at timestamptz not null default now()
);

alter table public.help_guide enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'help_guide' loop
    execute format('drop policy %I on public.help_guide', p.policyname);
  end loop;
end $$;
-- everyone logged in may read it (it is the same help everyone sees); only the committee changes it
create policy all_read on public.help_guide for select to authenticated using (true);
create policy committee_write on public.help_guide for all to authenticated using (public.is_committee()) with check (public.is_committee());
revoke all on public.help_guide from anon;
grant select, insert, update, delete on public.help_guide to authenticated, service_role;

-- Check: should show tables | 1
select 'tables' as item, count(*)::text as value from pg_tables where schemaname = 'public' and tablename = 'help_guide';
