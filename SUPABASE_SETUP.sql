-- Aakar Sukh Tower - database setup / security fix
-- Safe to run more than once. It does NOT delete any data.
-- Run in Supabase > SQL Editor.

-- 1. New columns the app needs (added only if missing)
alter table public.flats   add column if not exists r2_url     text;   -- per-flat document in R2
alter table public.flats   add column if not exists sqft       integer; -- built-up area (Admin charges panel)
alter table public.notices add column if not exists file_url   text;   -- notice attachment in R2
alter table public.notices add column if not exists created_by text;   -- email of committee member

-- 2. Lock down every table: only logged-in committee members (Supabase Auth users) can read/write.
--    The public key on the website can no longer read anything on its own.
do $$
declare t text; p record;
begin
  foreach t in array array['flats','notices','members','maintenance','events','businesses'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy committee_full_access on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- 3. Check: every table should show rls_on = true and one policy "committee_full_access" for {authenticated}
select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by tablename;
