-- MT_01 (Nov 2026) - multi-tenant step 2: the list of societies and who belongs to which.
-- Run by hand in the Supabase SQL Editor, AFTER a full backup. Safe to run again. Changes nothing the app uses today:
-- two NEW tables only; no existing table, rule, login or screen is touched. Undo: MT_01_UNDO.sql (run MT_02_UNDO.sql first).
-- Aakar is the first society. Its id is fixed (not a secret) so MT_02 can use the same value as the default for every table.

create table if not exists public.societies (
  id         uuid primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),  -- the society address: aakar.<domain>
  name       text not null,
  status     text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.society_memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  society_id uuid not null references public.societies(id) on delete cascade,
  role       text not null check (role in ('society_admin', 'committee', 'flat', 'tenant')),
  flat_id    text,                      -- flat login: its flat; tenant login: the rented flat
  created_at timestamptz not null default now(),
  primary key (user_id, society_id)
);
create index if not exists society_memberships_society_idx on public.society_memberships (society_id);

-- Aakar, the first society.
insert into public.societies (id, slug, name)
values ('a4a4a4a4-0000-4000-8000-000000000001', 'aakar', 'Aakar Sukh Tower')
on conflict (id) do nothing;

-- Every login that exists today becomes a member of Aakar, with the same role it has now.
-- (Read only from auth.users; the logins themselves are not changed. Logins with no role stay without access, as today.)
insert into public.society_memberships (user_id, society_id, role, flat_id)
select u.id, 'a4a4a4a4-0000-4000-8000-000000000001',
       case u.raw_app_meta_data->>'role' when 'committee' then 'committee' when 'resident' then 'flat' else 'tenant' end,
       case u.raw_app_meta_data->>'role' when 'resident' then u.raw_app_meta_data->>'flat_id'
                                         when 'tenant'   then u.raw_app_meta_data->>'tenant_flat' end
  from auth.users u
 where u.raw_app_meta_data->>'role' in ('committee', 'resident', 'tenant')
on conflict (user_id, society_id) do nothing;

-- Access rules: a login may read only its own memberships and the societies it belongs to. Nobody writes from the app
-- (only the server key does); that is why "authenticated" gets select only (RLS has no write policy either).
alter table public.societies enable row level security;
alter table public.society_memberships enable row level security;
drop policy if exists own_membership_read on public.society_memberships;
create policy own_membership_read on public.society_memberships for select to authenticated using (user_id = auth.uid());
drop policy if exists own_society_read on public.societies;
create policy own_society_read on public.societies for select to authenticated
  using (id in (select m.society_id from public.society_memberships m where m.user_id = auth.uid()));

revoke all on public.societies, public.society_memberships from anon;
grant select on public.societies, public.society_memberships to authenticated;
grant select, insert, update, delete on public.societies, public.society_memberships to service_role;

-- Check: expect 1 society (Aakar), one membership per login that has a role today, and 0 logins left out.
select 'societies' as what, count(*)::text as value from public.societies
union all select 'memberships', count(*)::text from public.society_memberships
union all select 'logins with a role (should equal memberships)', count(*)::text from auth.users where raw_app_meta_data->>'role' in ('committee', 'resident', 'tenant')
union all select 'logins left out', count(*)::text from auth.users u
  where u.raw_app_meta_data->>'role' in ('committee', 'resident', 'tenant')
    and not exists (select 1 from public.society_memberships m where m.user_id = u.id)
union all select 'anon can read? (should be false)', (has_table_privilege('anon', 'public.societies', 'select') or has_table_privilege('anon', 'public.society_memberships', 'select'))::text;
