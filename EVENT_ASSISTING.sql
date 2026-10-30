-- Event role "Assisting" (30 Oct 2026), also for the TENANT of a rented flat. Run once in Supabase → SQL Editor.
-- Safe to re-run. Run after EVENT_COMMITTEES.sql, EVENT_REGISTRATION.sql, EVENT_CHECKINS.sql and TENANT_LOGINS.sql.
--
--   • event_team.role may now be 'Assisting' (besides Convenor / Treasurer / Member).
--   • event_team.member_kind: 'flat' (the flat login's household, as before) or 'tenant' (the tenant login of that flat).
--     A tenant can only be 'Assisting', and only while the flat has an active tenant login. The owner's household and the
--     tenant of the same flat can both be on a team (two rows).
--   • my_event_role() now also answers for a tenant login (its own 'tenant' row only).
--   • Assisting = helps on the day: sees the team, the event's minutes and the registration / gate list, and can scan
--     passes at the gate. It does NOT see the event accounts (money book) unless the convenor makes them public to all
--     members, and gets no society committee, finance, document or admin access.
-- Undo: EVENT_ASSISTING_UNDO.sql.

-- 1. Columns and rules on the table
alter table public.event_team add column if not exists member_kind text not null default 'flat';
alter table public.event_team drop constraint if exists event_team_member_kind_check;
alter table public.event_team add constraint event_team_member_kind_check check (member_kind in ('flat', 'tenant'));
alter table public.event_team drop constraint if exists event_team_role_check;
alter table public.event_team add constraint event_team_role_check check (role in ('Convenor', 'Treasurer', 'Member', 'Assisting'));
alter table public.event_team drop constraint if exists event_team_tenant_assisting_check;
alter table public.event_team add constraint event_team_tenant_assisting_check check (member_kind = 'flat' or role = 'Assisting');
-- one row per flat per event becomes one row per flat AND kind (owner's household and tenant may both help)
do $$ declare c text; begin
  select k.conname into c from pg_constraint k
   where k.conrelid = 'public.event_team'::regclass and k.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid = k.conrelid and a.attnum = any (k.conkey)) = array['event_id', 'flat_id'];
  if c is not null then execute format('alter table public.event_team drop constraint %I', c); end if;
end $$;
create unique index if not exists event_team_one_per_kind on public.event_team(event_id, flat_id, member_kind);

-- 2. A tenant is added only while the flat has an active tenant login
create or replace function public.event_team_tenant_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.member_kind = 'tenant' and (tg_op = 'INSERT' or new.flat_id is distinct from old.flat_id or old.member_kind is distinct from 'tenant')
     and auth.uid() is not null and not public.flat_has_tenant_login(new.flat_id) then
    raise exception 'Flat % has no active tenant login. Create the tenant login first (flat page → TENANT LOGIN).', new.flat_id;
  end if;
  return new;
end $$;
revoke all on function public.event_team_tenant_guard() from public, anon, authenticated;
drop trigger if exists event_team_tenant_guard on public.event_team;
create trigger event_team_tenant_guard before insert or update on public.event_team for each row execute function public.event_team_tenant_guard();

-- 3. Role of the logged-in person in an event: the flat login's household row, or the tenant login's own row
create or replace function public.my_event_role(p_event uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.role from public.event_team t
   where t.event_id = p_event
     and ((t.member_kind = 'flat' and public.my_flat() is not null and t.flat_id = public.my_flat())
       or (t.member_kind = 'tenant' and public.my_tenant_flat() is not null and t.flat_id = public.my_tenant_flat()))
   order by case t.member_kind when 'flat' then 0 else 1 end
   limit 1
$$;
revoke all on function public.my_event_role(uuid) from public, anon;
grant execute on function public.my_event_role(uuid) to authenticated;

-- 4. Money book: Assisting does not see it (only Convenor / Treasurer / Member, own payments, or public accounts)
drop policy if exists team_read on public.event_money;
create policy team_read on public.event_money for select to authenticated using (
  public.my_event_role(event_id) in ('Convenor', 'Treasurer', 'Member') or (public.my_flat() is not null and flat_id = public.my_flat())
  or exists (select 1 from public.events e where e.id = event_id and e.accounts_public));

-- Check (expected): kind column true • Assisting allowed true • tenant only Assisting true • one-per-kind index 1 •
--                   guard on true • role function knows tenants true • money hidden from Assisting true
select 'kind column' as item, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_team' and column_name = 'member_kind')::text as value
union all select 'Assisting allowed', (pg_get_constraintdef((select oid from pg_constraint where conname = 'event_team_role_check')) like '%Assisting%')::text
union all select 'tenant only Assisting', exists (select 1 from pg_constraint where conname = 'event_team_tenant_assisting_check')::text
union all select 'one-per-kind index', count(*)::text from pg_indexes where schemaname = 'public' and indexname = 'event_team_one_per_kind'
union all select 'guard on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'event_team_tenant_guard' and not tgisinternal)::text
union all select 'role function knows tenants', (pg_get_functiondef('public.my_event_role(uuid)'::regprocedure) like '%my_tenant_flat%')::text
union all select 'money hidden from Assisting', (select qual like '%Member%' from pg_policies where schemaname = 'public' and tablename = 'event_money' and policyname = 'team_read')::text;
