-- UNDO of EVENT_ASSISTING.sql: back to Convenor / Treasurer / Member, one row per flat per event.
-- Tenant rows and Assisting rows are REMOVED from event teams (nothing else changes). Safe to re-run.

delete from public.event_team where member_kind = 'tenant' or role = 'Assisting';
drop trigger if exists event_team_tenant_guard on public.event_team;
drop function if exists public.event_team_tenant_guard();
drop index if exists public.event_team_one_per_kind;
alter table public.event_team drop constraint if exists event_team_tenant_assisting_check;
alter table public.event_team drop constraint if exists event_team_member_kind_check;
alter table public.event_team drop column if exists member_kind;
alter table public.event_team drop constraint if exists event_team_role_check;
alter table public.event_team add constraint event_team_role_check check (role in ('Convenor', 'Treasurer', 'Member'));
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_team'::regclass and contype = 'u') then
    alter table public.event_team add constraint event_team_event_id_flat_id_key unique (event_id, flat_id);
  end if;
end $$;

-- as in EVENT_COMMITTEES.sql
create or replace function public.my_event_role(p_event uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.role from public.event_team t where t.event_id = p_event and public.my_flat() is not null and t.flat_id = public.my_flat() limit 1
$$;
revoke all on function public.my_event_role(uuid) from public, anon;
grant execute on function public.my_event_role(uuid) to authenticated;
drop policy if exists team_read on public.event_money;
create policy team_read on public.event_money for select to authenticated using (
  public.my_event_role(event_id) is not null or (public.my_flat() is not null and flat_id = public.my_flat())
  or exists (select 1 from public.events e where e.id = event_id and e.accounts_public));

-- Check (expected): kind column false • role function knows tenants false
select 'kind column' as item, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_team' and column_name = 'member_kind')::text as value
union all select 'role function knows tenants', (pg_get_functiondef('public.my_event_role(uuid)'::regprocedure) like '%my_tenant_flat%')::text;
