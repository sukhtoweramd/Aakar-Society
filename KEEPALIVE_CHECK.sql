-- KEEPALIVE_CHECK.sql · READ ONLY check for KEEPALIVE.sql (changes nothing). Run any time after KEEPALIVE.sql.
-- Every row must show ok = true. If you have run KEEPALIVE_UNDO.sql, this check is not needed (the function is gone).

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

-- Optional second look (run separately): every function in public that the not-logged-in role can run.
-- Expect keepalive plus the harmless ones already noted in the 25 Oct security audit (my_flat, booking_today,
-- booking_flat_label and trigger functions). Anything else deserves a look.
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
--  order by 1;
