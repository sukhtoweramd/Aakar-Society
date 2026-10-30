-- 00c · LIVE CHECK after the 30 Oct 2026 changes (READ ONLY — changes nothing). Run in Supabase → SQL Editor and send
-- the result. Every row shows what is expected next to what is live; "ok" is true when they match.

with
pol as (select tablename, count(*) as n,
               bool_or(cmd in ('DELETE', 'ALL') and policyname not like 'committee_all%') as member_delete,
               bool_or('anon' = any (roles) or 'public' = any (roles)) as open_to_anon
          from pg_policies where schemaname = 'public' group by tablename),
fn as (select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as cfg,
              has_function_privilege('anon', p.oid, 'execute') as anon_run
         from pg_proc p where p.pronamespace = 'public'::regnamespace)
select item, expected, live, (expected = live) as ok from (
  -- new tables: RLS on, not readable by anon, rules present
  select 'society_contacts: rls / anon / rules' as item, 'true / false / 4' as expected,
         (select relrowsecurity::text from pg_class where oid = to_regclass('public.society_contacts')) || ' / ' ||
         has_table_privilege('anon', 'public.society_contacts', 'select')::text || ' / ' || coalesce((select n::text from pol where tablename = 'society_contacts'), '0') as live
  union all select 'flat_tenant_logins: rls / anon / rules', 'true / false / 1',
         (select relrowsecurity::text from pg_class where oid = to_regclass('public.flat_tenant_logins')) || ' / ' ||
         has_table_privilege('anon', 'public.flat_tenant_logins', 'select')::text || ' / ' || coalesce((select n::text from pol where tablename = 'flat_tenant_logins'), '0')
  union all select 'letter_templates: rls / anon / rules', 'true / false / 4',
         (select relrowsecurity::text from pg_class where oid = to_regclass('public.letter_templates')) || ' / ' ||
         has_table_privilege('anon', 'public.letter_templates', 'select')::text || ' / ' || coalesce((select n::text from pol where tablename = 'letter_templates'), '0')
  -- nothing open to anon anywhere
  union all select 'rules open to anon/public (count)', '0', (select count(*)::text from pol where open_to_anon)
  -- no member (non-committee) delete rule on the tables that must never be deleted from
  union all select 'member delete on contacts / areas / formats', 'false / false / false',
         coalesce((select member_delete::text from pol where tablename = 'society_contacts'), 'false') || ' / ' ||
         coalesce((select member_delete::text from pol where tablename = 'committee_areas'), 'false') || ' / ' ||
         coalesce((select member_delete::text from pol where tablename = 'letter_templates'), 'false')
  -- every security-definer function has search_path fixed
  union all select 'security-definer functions without fixed search_path', '0',
         (select count(*)::text from fn where prosecdef and cfg not like '%search_path%')
  -- new functions closed to anon
  union all select 'anon can run my_tenant_flat / my_home_flat / area_rights / can_approve_letters', 'false / false / false / false',
         coalesce((select anon_run::text from fn where proname = 'my_tenant_flat'), '-') || ' / ' || coalesce((select anon_run::text from fn where proname = 'my_home_flat'), '-') || ' / ' ||
         coalesce((select anon_run::text from fn where proname = 'area_rights'), '-') || ' / ' || coalesce((select anon_run::text from fn where proname = 'can_approve_letters'), '-')
  -- guards / triggers on
  union all select 'triggers on: areas guard / tenant moved out / team tenant guard / letter guard', 'true / true / true / true',
         (select coalesce(bool_and(tgenabled <> 'D'), false)::text from pg_trigger where tgname = 'committee_areas_guard' and not tgisinternal) || ' / ' ||
         (select coalesce(bool_and(tgenabled <> 'D'), false)::text from pg_trigger where tgname = 'tenant_moved_out' and not tgisinternal) || ' / ' ||
         (select coalesce(bool_and(tgenabled <> 'D'), false)::text from pg_trigger where tgname = 'event_team_tenant_guard' and not tgisinternal) || ' / ' ||
         (select coalesce(bool_and(tgenabled <> 'D'), false)::text from pg_trigger where tgname = 'letter_request_guard' and not tgisinternal)
  -- restore covers every table the app backs up (as of 30 Oct)
  union all select 'restore includes contacts / tenant logins / formats', 'true / true / true',
         (pg_get_functiondef('public.restore_society_backup(jsonb)'::regprocedure) like '%''society_contacts''%')::text || ' / ' ||
         (pg_get_functiondef('public.restore_society_backup(jsonb)'::regprocedure) like '%''flat_tenant_logins''%')::text || ' / ' ||
         (pg_get_functiondef('public.restore_society_backup(jsonb)'::regprocedure) like '%''letter_templates''%')::text
  -- tenant logins never carry flat_id (owner rules would apply)
  union all select 'tenant logins with flat_id (count)', '0',
         (select count(*)::text from auth.users where raw_app_meta_data ->> 'role' = 'tenant' and raw_app_meta_data ? 'flat_id')
  union all select 'flats (all / Tower C)', '91 / 11',
         (select count(*)::text from public.flats) || ' / ' || (select count(*)::text from public.flats where tower = 'C')
) x order by ok, item;
