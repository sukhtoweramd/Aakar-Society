-- MT_03 (Nov 2026) - multi-tenant step 4a: "which society is this login in", and who is committee / main admin PER SOCIETY.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 and MT_02. Safe to run again. Changes no data and no table.
-- Undo: MT_03_UNDO.sql (puts the two functions back exactly as they were).
--
-- What changes: one new function, active_society(), and two existing ones, is_committee() and is_main_admin().
-- Aakar behaves exactly as today:
--   * every Aakar login has a membership (MT_01), so it is committee / main admin in Aakar exactly as before;
--   * "main admin" is still the OLDEST committee login (by auth.users.created_at, as in AREAS_BACKUPS.sql), now of the active society;
--   * TRANSITION: a login that has NO membership at all is judged by the old rule, so a login created before the app writes
--     memberships keeps working (it is Aakar's, the only society). The check at the bottom must show 0 such logins before the
--     fallback is removed (step 4b). A login that belongs to a society it is not in gets NO committee rights there.
-- Not changed here: my_flat(), my_tenant_flat(), my_home_flat() (the society is enforced by the table rules in step 4b).

-- 1. The society of the login. A login in several societies can name one with app_metadata.active_society (set by the server only);
--    it counts only if the login really is a member. Otherwise the oldest membership. Nobody logged in / not a member = null.
create or replace function public.active_society() returns uuid
language sql stable security definer set search_path = public as $$
  select m.society_id
    from public.society_memberships m
   where m.user_id = auth.uid()
   order by (m.society_id::text = coalesce(auth.jwt() -> 'app_metadata' ->> 'active_society', '')) desc, m.created_at, m.society_id
   limit 1
$$;
revoke all on function public.active_society() from public, anon;
grant execute on function public.active_society() to authenticated, service_role;

-- 2. Committee: the login has role 'committee' (as today) AND is a committee / society-admin member of its active society.
create or replace function public.is_committee() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data ->> 'role' = 'committee')
     and (
       exists (select 1 from public.society_memberships m
                where m.user_id = auth.uid() and m.society_id = public.active_society() and m.role in ('committee', 'society_admin'))
       or not exists (select 1 from public.society_memberships m where m.user_id = auth.uid())     -- transition: no membership yet
     )
$$;
revoke all on function public.is_committee() from public, anon;
grant execute on function public.is_committee() to authenticated, service_role;

-- 3. Main admin of the society: a society admin if the society has any; otherwise the oldest committee login of that society
--    (today's rule, same ordering). A login with no membership is compared with all committee logins, as before.
create or replace function public.is_main_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_committee() and (
    case
      when exists (select 1 from public.society_memberships m where m.user_id = auth.uid()) then
        case
          when exists (select 1 from public.society_memberships a where a.society_id = public.active_society() and a.role = 'society_admin')
            then exists (select 1 from public.society_memberships a where a.society_id = public.active_society() and a.role = 'society_admin' and a.user_id = auth.uid())
          else auth.uid() = (select u.id from public.society_memberships m join auth.users u on u.id = m.user_id
                              where m.society_id = public.active_society() and m.role = 'committee' and u.raw_app_meta_data ->> 'role' = 'committee'
                              order by u.created_at, u.id limit 1)
        end
      else auth.uid() = (select u.id from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1)
    end)
$$;
revoke all on function public.is_main_admin() from public, anon;
grant execute on function public.is_main_admin() to authenticated;

-- Check: expect: both functions closed to anon; 0 logins with a role but no membership; oldest committee login = Aakar's main admin (compare by email).
select 'active_society closed to anon' as item, (not has_function_privilege('anon', 'public.active_society()', 'execute'))::text as value
union all select 'is_committee closed to anon', (not has_function_privilege('anon', 'public.is_committee()', 'execute'))::text
union all select 'is_main_admin closed to anon', (not has_function_privilege('anon', 'public.is_main_admin()', 'execute'))::text
union all select 'is_committee uses memberships', (pg_get_functiondef('public.is_committee()'::regprocedure) like '%society_memberships%')::text
union all select 'logins with a role but no membership (expect 0)', count(*)::text from auth.users u
  where u.raw_app_meta_data ->> 'role' in ('committee', 'resident', 'tenant')
    and not exists (select 1 from public.society_memberships m where m.user_id = u.id)
union all select 'oldest committee login (main admin today)', (select u.email from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1);
