-- 02_UNDO · Put is_committee() back exactly as it was on 24 Oct 2026 (any non-resident login = committee).
create or replace function public.is_committee() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'committee') <> 'resident'
     and exists (select 1 from auth.users u where u.id = auth.uid())
$$;

-- Check: should show true (old rule back)
select (pg_get_functiondef('public.is_committee()'::regprocedure) like '%<> ''resident''%')::text as old_rule_back;
