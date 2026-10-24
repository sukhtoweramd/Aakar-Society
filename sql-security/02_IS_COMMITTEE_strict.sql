-- 02 · Committee = role 'committee' only   (Aakar security fixes, Oct 2026)
-- Run AFTER 01 and AFTER the app update (pull request "Committee only with role committee") is merged and live.
-- Before: any login that was not 'resident' counted as committee (also a login with no role at all).
-- After:  only a login whose role is exactly 'committee' counts. The role is read from the login record itself
--         (auth.users), so it applies at once — nobody has to log out and in again, and removing the role works at once too.
-- Safety: the script stops without changing anything if no login has role 'committee' (so nobody is locked out).

do $$ begin
  if not exists (select 1 from auth.users where raw_app_meta_data ->> 'role' = 'committee') then
    raise exception 'Stopped: no login has role committee yet. Run 01 first.';
  end if;
end $$;

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

-- Check: the new definition, and which logins now count as committee (expect your 2 committee emails)
select 'definition' as item, (pg_get_functiondef('public.is_committee()'::regprocedure) like '%= ''committee''%')::text as value
union all
select 'committee login', email from auth.users where raw_app_meta_data ->> 'role' = 'committee';
