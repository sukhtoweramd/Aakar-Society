-- Member screens: which tabs flat logins can open (ADMIN → MEMBER SCREENS). 25 Oct 2026.
-- Run once in Supabase > SQL Editor. Safe to run again. Until it is run, members keep seeing every member tab.
-- Everyone logged in can read the setting (the app needs it to draw the menu); only committee logins can change it.

create table if not exists public.app_settings (
  id          int primary key default 1 check (id = 1),     -- one row only
  member_tabs text[] not null default array['COVER','INDEX','FLOOR','DIRECTORY','BUSINESS','VAULT','EVENTS'],
  updated_by  text,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists everyone_read on public.app_settings;
drop policy if exists committee_change on public.app_settings;
create policy everyone_read on public.app_settings for select to authenticated using (true);
create policy committee_change on public.app_settings for update to authenticated using (public.is_committee()) with check (public.is_committee());

revoke all on public.app_settings from anon;
grant select, insert, update, delete on public.app_settings to authenticated, service_role;

-- Check: one row with the list of member tabs, and 2 rules
select id, member_tabs, (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_settings') as rules
from public.app_settings;
