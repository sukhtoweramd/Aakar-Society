-- KEEPALIVE.sql · one harmless function for the daily GitHub keep-alive job (11 Nov 2026)
--
-- What it does: creates public.keepalive(), which returns the number 1. It reads and changes NO table, view or data.
-- Why: the website's public key (the "anon" role) cannot read any table, by design. A daily keep-alive request therefore
--      needs one thing it is allowed to call; this is that one thing. Nothing else is opened to anon.
-- Safe by construction:
--   * SECURITY INVOKER (the default): it runs with the caller's own rights, so it grants nothing extra.
--   * search_path is empty: the body uses no table, function or schema name, so nothing can be hijacked.
--   * Only the anon role may run it. Everyone else (PUBLIC, logged-in members, service_role) is revoked.
-- Does NOT touch: tables, views, row-level rules (RLS), table grants, logins, billing, or any data.
-- Run once in Supabase > SQL Editor. Safe to run again. Undo: KEEPALIVE_UNDO.sql
-- The check result at the bottom must show ok = true on every row.

create or replace function public.keepalive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

comment on function public.keepalive() is
  'Returns 1. Reads no data. Called once a day by the GitHub keep-alive workflow with the public (anon) key.';

-- Supabase lets every role run a new function unless told otherwise: close it, then open it for anon only.
revoke all on function public.keepalive() from public;
revoke all on function public.keepalive() from anon, authenticated, service_role;
grant execute on function public.keepalive() to anon;

-- Make the REST API notice the new function right away.
notify pgrst, 'reload schema';

-- Check (read only) — same as KEEPALIVE_CHECK.sql
with f as (
  select p.oid as fid, p.prolang, p.provolatile, p.prosecdef, p.proconfig, p.prosrc, p.proacl, p.proowner
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'keepalive'
)
select item, expected, live, (expected = live) as ok from (
  select 'function exists (count)' as item, '1' as expected, (select count(*)::text from f) as live
  union all select 'return type / language / volatility (s = stable)', 'integer / sql / s',
    (select pg_get_function_result(fid) || ' / ' || (select lanname from pg_language where oid = f.prolang) || ' / ' || provolatile::text from f)
  union all select 'security definer (expect false = invoker)', 'false', (select prosecdef::text from f)
  union all select 'search_path is fixed', 'true',
    (select (coalesce(array_to_string(proconfig, ','), '') like '%search_path%')::text from f)
  union all select 'body is only a constant (select 1)', 'select1',
    (select regexp_replace(lower(prosrc), '[\s;]', '', 'g') from f)
  union all select 'anon / authenticated / service_role can run', 'true / false / false',
    (select has_function_privilege('anon', fid, 'execute')::text || ' / ' ||
            has_function_privilege('authenticated', fid, 'execute')::text || ' / ' ||
            has_function_privilege('service_role', fid, 'execute')::text from f)
  union all select 'PUBLIC (everyone) may run (expect false)', 'false',
    (select exists (select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE')::text from f)
  union all select 'calling it returns', '1', (select public.keepalive())::text
  union all select 'tables / views anon can read (count, expect 0 as before)', '0',
    (select count(*)::text from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
        and has_table_privilege('anon', c.oid, 'select'))
) x order by ok, item;
