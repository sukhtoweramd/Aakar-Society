-- Important contacts (CONTACTS tab), 30 Oct 2026. Run once in Supabase → SQL Editor. Safe to re-run.
-- Society-level phone list: lift, fire, MyGate, security, plumber … Not the same as emergency_contacts (a flat's family
-- emergency numbers). Every logged-in member sees the ACTIVE contacts; committee logins add, edit and switch them
-- on/off. There is no delete: a contact that is no longer used is switched off (kept, hidden from members).
-- After this script run sql-security/08_RESTORE_contacts.sql (so restores bring the contacts back).

create table if not exists public.society_contacts (
  id             uuid primary key default gen_random_uuid(),
  category       text not null check (length(trim(category)) > 0),       -- e.g. Lift, Fire, Security, Electricity
  name           text not null check (length(trim(name)) > 0),           -- service / company / contact name
  contact_person text,
  phone          text,
  alt_phone      text,
  notes          text,
  sort_order     int not null default 100,                                -- smaller first, within the category
  active         boolean not null default true,
  amc_id         uuid references public.amc_contracts(id) on delete set null,  -- optional link to COMMITTEE → AMC
  created_by     text, created_at timestamptz not null default now(),
  updated_by     text, updated_at timestamptz not null default now()
);
create index if not exists society_contacts_order_idx on public.society_contacts(category, sort_order);

alter table public.society_contacts enable row level security;
drop policy if exists members_read_active on public.society_contacts;
drop policy if exists committee_read on public.society_contacts;
drop policy if exists committee_add on public.society_contacts;
drop policy if exists committee_change on public.society_contacts;
create policy members_read_active on public.society_contacts for select to authenticated using (active);
create policy committee_read   on public.society_contacts for select to authenticated using (public.is_committee());
create policy committee_add    on public.society_contacts for insert to authenticated with check (public.is_committee());
create policy committee_change on public.society_contacts for update to authenticated using (public.is_committee()) with check (public.is_committee());
-- no delete rule: nobody can delete through the app

revoke all on public.society_contacts from anon;
grant select, insert, update, delete on public.society_contacts to authenticated, service_role;

-- Show the new tab to flat logins (ADMIN → MEMBER SCREENS can hide it again)
alter table public.app_settings alter column member_tabs set default array['COVER','INDEX','FLOOR','DIRECTORY','BUSINESS','VAULT','EVENTS','CONTACTS'];
update public.app_settings set member_tabs = member_tabs || array['CONTACTS'] where id = 1 and not ('CONTACTS' = any (member_tabs));

-- Check (expected): table 1 • rules 4 • rls on true • anon can read false • CONTACTS in member tabs true
select 'table' as item, count(*)::text as value from information_schema.tables where table_schema = 'public' and table_name = 'society_contacts'
union all select 'rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'society_contacts'
union all select 'rls on', (select relrowsecurity from pg_class where oid = 'public.society_contacts'::regclass)::text
union all select 'anon can read', has_table_privilege('anon', 'public.society_contacts', 'select')::text
union all select 'CONTACTS in member tabs', coalesce((select 'CONTACTS' = any (member_tabs) from public.app_settings where id = 1), false)::text;
