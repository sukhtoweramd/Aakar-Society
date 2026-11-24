-- STAGE0_QUERIES.sql · READ ONLY. Changes nothing. Multi-tenancy stage 0: a picture of the live database as it is today.
-- How: Supabase > SQL Editor. Run each numbered query ON ITS OWN (the editor shows only the last result of a script),
--      export each result (Export > CSV) and keep the files OUTSIDE this public repository. No query lists names, mobiles,
--      emails or any row data: only structure and counts.

-- 1. Every public table and view with its type, estimated rows, and whether row rules are on
select c.relname as name,
       case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind,
       c.relrowsecurity as rls_on,
       coalesce(s.n_live_tup, 0) as approx_rows,
       c.reloptions as options              -- views: look for security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  left join pg_stat_user_tables s on s.relid = c.oid
 where c.relkind in ('r','v','m')
 order by kind, name;

-- 2. Every column (so we know which tables hold flat_id and which have no owner column yet)
select table_name, ordinal_position as pos, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
 order by table_name, ordinal_position;

-- 3. Primary keys, unique rules and foreign keys (a flat id like A101 and numbers like bill_no must become per-society)
select conrelid::regclass::text as tbl, conname, contype as type, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where connamespace = 'public'::regnamespace and contype in ('p','u','f')
 order by 1, 3, 2;

-- 4. Indexes
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2;

-- 5. Row rules (policies): how many per table, and the text of each
select tablename, count(*) as rules from pg_policies where schemaname = 'public' group by 1 order by 1;
select tablename, policyname, cmd, roles, qual as using_text, with_check as check_text
  from pg_policies where schemaname = 'public' order by 1, 2;

-- 6. Functions in public (security definer ones bypass the row rules)
select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, l.lanname as language
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  join pg_language l on l.oid = p.prolang
 order by 1;

-- 7. Triggers on public tables
select event_object_table as tbl, trigger_name, event_manipulation as event, action_timing as timing
  from information_schema.triggers where trigger_schema = 'public' order by 1, 2;

-- 8. Sequences
select sequencename, last_value from pg_sequences where schemaname = 'public' order by 1;

-- 9. Who can touch what (grants for the website roles)
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
 group by 1, 2 order by 1, 2;

-- 10. Logins by kind (counts only): committee / flat / tenant / no role
select coalesce(raw_app_meta_data ->> 'role', '(no role)') as role, count(*) as logins
  from auth.users group by 1 order by 1;
