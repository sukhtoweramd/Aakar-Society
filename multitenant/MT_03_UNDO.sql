-- Undo of MT_03_ACTIVE_SOCIETY.sql: is_committee() and is_main_admin() exactly as before (sql-security/02, AREAS_BACKUPS.sql).
create or replace function public.is_committee() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and u.raw_app_meta_data ->> 'role' = 'committee'
  )
$$;
revoke all on function public.is_committee() from public, anon;
grant execute on function public.is_committee() to authenticated, service_role;

create or replace function public.is_main_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_committee() and auth.uid() = (
    select u.id from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1)
$$;
revoke all on function public.is_main_admin() from public, anon;
grant execute on function public.is_main_admin() to authenticated;

drop function if exists public.active_society();
select 'is_committee back to the old rule' as item, (pg_get_functiondef('public.is_committee()'::regprocedure) not like '%society_memberships%')::text as value
union all select 'active_society removed', (to_regprocedure('public.active_society()') is null)::text;
