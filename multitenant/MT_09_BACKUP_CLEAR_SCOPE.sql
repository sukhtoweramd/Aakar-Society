-- MT_09 (Nov 2026) - multi-tenant step 4d-1: "clear test documents" and "restore backup" act on ONE society, not on the whole database.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_08. Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table and no data. Undo: MT_09_UNDO.sql (puts the two functions back exactly as they were; needs the saved copy made here).
--
-- Why: both functions run with owner rights and say "delete from <table> where true". With a second society they would erase the
-- OTHER society's bills, receipts, letters and (restore) every table. After this script:
--   clear_test_documents(p_bill, p_other, p_rcpt, p_letter [, p_society])   restore_society_backup(p [, p_society])
--   * the optional last argument names the society; left out = current_society_or_first() (Aakar's, as before: the server calls these with
--     its own key, so there is no login). The app is changed later (next PR) to pass the caller's society.
--   * every delete says "where society_id = <that society>", the "society is live" lock looks only at that society's society_live row,
--     the counters changed are that society's billing_settings row, and restored rows are always written with that society's id
--     (a society_id inside a backup file is ignored, so a file can never put rows into another society).
-- Each function is rewritten from its CURRENT live text (the two databases do not have the same version of clear_test_documents:
-- with or without sql-security/12), so the behaviour you have today stays; only the society is added. If the live text has a form this
-- script does not know, it stops with a clear message and changes nothing. The original text of both functions is first copied into
-- zz_mt09_function_backup (a one-off copy, not society data; same idea as zz_security_app_meta_backup) for the undo.
-- Still the same: who may run them (service_role only; members cannot), the backup label "aakar-society" (changed with the app, step 4d-5).

-- 1. One-off copy of the functions as they are now -------------------------------------------------------------------------------------
create table if not exists public.zz_mt09_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt09_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt09_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt09_function_backup to service_role;

do $$
begin
  if to_regprocedure('public.clear_test_documents(integer,integer,integer,integer)') is not null then
    insert into public.zz_mt09_function_backup (fn, def)
    values ('clear_test_documents', pg_get_functiondef('public.clear_test_documents(integer,integer,integer,integer)'::regprocedure))
    on conflict (fn) do update set def = excluded.def, saved_at = now();   -- the old form is present only while MT_09 is not applied, so this is always the true original
  end if;
  if to_regprocedure('public.restore_society_backup(jsonb)') is not null then
    insert into public.zz_mt09_function_backup (fn, def)
    values ('restore_society_backup', pg_get_functiondef('public.restore_society_backup(jsonb)'::regprocedure))
    on conflict (fn) do update set def = excluded.def, saved_at = now();   -- the old form is present only while MT_09 is not applied, so this is always the true original
  end if;
end $$;

-- 2. clear_test_documents -------------------------------------------------------------------------------------------------------------
do $$
declare
  def text;
  newdef text;
  failed text;
begin
  if to_regprocedure('public.current_society_or_first()') is null then
    raise exception 'Run MT_06_SETTINGS_PER_SOCIETY.sql first (public.current_society_or_first() is missing).';
  end if;
  if to_regprocedure('public.clear_test_documents(integer,integer,integer,integer,uuid)') is not null then
    raise notice 'clear_test_documents already takes a society';
    return;
  end if;
  if to_regprocedure('public.clear_test_documents(integer,integer,integer,integer)') is null then
    raise notice 'clear_test_documents not found (BACKUP_RESTORE.sql not run); skipped';
    return;
  end if;
  def := pg_get_functiondef('public.clear_test_documents(integer,integer,integer,integer)'::regprocedure);
  newdef := def;
  -- the society this call is about
  newdef := regexp_replace(newdef, 'p_letter integer\)', 'p_letter integer, p_society uuid DEFAULT NULL::uuid)');
  -- the "society is live" lock: this society only
  newdef := replace(newdef, 'exists (select 1 from public.society_live)', 'exists (select 1 from public.society_live where society_id = v_society)');
  -- the deletes (three shapes exist in the two versions)
  newdef := regexp_replace(newdef, 'delete from public\.([a-z_]+) where true;', 'delete from public.\1 where society_id = v_society;', 'g');
  newdef := replace(newdef, 'execute ''delete from public.letters where true''', 'execute format(''delete from public.letters where society_id = %L'', v_society)');
  newdef := replace(newdef, 'format(''delete from public.%I where true'', t)', 'format(''delete from public.%I where society_id = %L'', t, v_society)');
  -- the counters of this society (text inside a dynamic statement first, then the plain statements)
  newdef := replace(newdef, 'where society_id = public.current_society_or_first() and id = 1'' using p_letter', 'where society_id = $2 and id = 1'' using p_letter, v_society');
  newdef := replace(newdef, 'public.current_society_or_first()', 'v_society');
  -- the variable
  -- (regexp, not a fixed line break: a function pasted from a Windows machine is stored with CR + LF)
  newdef := regexp_replace(newdef, '\$function\$(\s*)declare', '$function$\1declare v_society uuid := coalesce(p_society, public.current_society_or_first());');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef ~ 'where true' then 'a "where true" delete is left' end,
    case when newdef !~ 'declare v_society uuid' then 'the declare line was not found' end,
    case when newdef !~ 'society_id = v_society' then 'no society filter was added' end,
    case when newdef ~ 'where id = 1' then 'a "where id = 1" is left' end,
    case when newdef !~ 'p_society uuid DEFAULT NULL' then 'the argument list was not found' end);
  if failed <> '' then
    raise exception 'clear_test_documents() has an unexpected form (%); nothing was changed. Send me its text.', failed;
  end if;
  execute newdef;
  drop function public.clear_test_documents(integer, integer, integer, integer);
  revoke all on function public.clear_test_documents(integer, integer, integer, integer, uuid) from public, anon, authenticated;
  grant execute on function public.clear_test_documents(integer, integer, integer, integer, uuid) to service_role;
end $$;

-- 3. restore_society_backup -----------------------------------------------------------------------------------------------------------
do $$
declare
  def text;
  newdef text;
  failed text;
begin
  if to_regprocedure('public.restore_society_backup(jsonb,uuid)') is not null then
    raise notice 'restore_society_backup already takes a society';
    return;
  end if;
  if to_regprocedure('public.restore_society_backup(jsonb)') is null then
    raise notice 'restore_society_backup not found (BACKUP_RESTORE.sql not run); skipped';
    return;
  end if;
  def := pg_get_functiondef('public.restore_society_backup(jsonb)'::regprocedure);
  newdef := def;
  newdef := replace(newdef, 'restore_society_backup(p jsonb)', 'restore_society_backup(p jsonb, p_society uuid DEFAULT NULL::uuid)');
  -- delete only this society's rows
  newdef := replace(newdef, 'execute format(''delete from public.%I where true'', t);', 'execute format(''delete from public.%I where society_id = %L'', t, v_society);');
  -- never copy a society_id out of the file; write this society's id instead
  newdef := replace(newdef, 'and (p->''tables''->t->0) ? a.attname;', 'and a.attname <> ''society_id'' and (p->''tables''->t->0) ? a.attname;');
  newdef := replace(newdef, '''insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)''',
                            '''insert into public.%I (society_id, %s) overriding system value select %L::uuid, %s from jsonb_populate_recordset(null::public.%I, $1)''');
  newdef := replace(newdef, 't, cols, cols, t) using p->''tables''->t;', 't, cols, v_society, cols, t) using p->''tables''->t;');
  -- the variable
  -- (regexp, not a fixed line break: a function pasted from a Windows machine is stored with CR + LF)
  newdef := regexp_replace(newdef, '\$function\$(\s*)declare', '$function$\1declare v_society uuid := coalesce(p_society, public.current_society_or_first());');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef ~ 'where true' then 'a "where true" delete is left' end,
    case when newdef !~ 'v_society uuid :=' then 'the declare line was not found' end,
    case when newdef !~ 'where society_id = %L' then 'the delete was not found' end,
    case when newdef !~ '\(society_id, %s\)' then 'the insert was not found' end,
    case when newdef !~ 'a.attname <> ''society_id''' then 'the column list was not found' end,
    case when newdef !~ 't, cols, v_society, cols, t\)' then 'the insert arguments were not found' end);
  if failed <> '' then
    raise exception 'restore_society_backup() has an unexpected form (%); nothing was changed. Send me its text.', failed;
  end if;
  execute newdef;
  drop function public.restore_society_backup(jsonb);
  revoke all on function public.restore_society_backup(jsonb, uuid) from public, anon, authenticated;
  grant execute on function public.restore_society_backup(jsonb, uuid) to service_role;
end $$;

-- 4. Check ----------------------------------------------------------------------------------------------------------------------------
select 'clear_test_documents takes a society, old form gone (expect yes)' as what,
  case when to_regprocedure('public.clear_test_documents(integer,integer,integer,integer,uuid)') is not null
        and to_regprocedure('public.clear_test_documents(integer,integer,integer,integer)') is null then 'yes' else 'NO' end as value
union all select 'restore_society_backup takes a society, old form gone (expect yes)',
  case when to_regprocedure('public.restore_society_backup(jsonb,uuid)') is not null
        and to_regprocedure('public.restore_society_backup(jsonb)') is null then 'yes' else 'NO' end
union all select 'no "where true" left in either function (expect yes)',
  case when coalesce((select bool_and(prosrc !~ 'where true') from pg_proc where proname in ('clear_test_documents', 'restore_society_backup') and pronamespace = 'public'::regnamespace), false) then 'yes' else 'NO' end
union all select 'members / anon can run them (expect false / false)',
  coalesce((select (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))::text
              from pg_proc p where p.proname = 'clear_test_documents' and p.pronamespace = 'public'::regnamespace), '-') || ' / ' ||
  coalesce((select (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))::text
              from pg_proc p where p.proname = 'restore_society_backup' and p.pronamespace = 'public'::regnamespace), '-')
union all select 'server key can run them (expect true / true)',
  coalesce((select has_function_privilege('service_role', p.oid, 'execute')::text from pg_proc p where p.proname = 'clear_test_documents' and p.pronamespace = 'public'::regnamespace), '-') || ' / ' ||
  coalesce((select has_function_privilege('service_role', p.oid, 'execute')::text from pg_proc p where p.proname = 'restore_society_backup' and p.pronamespace = 'public'::regnamespace), '-')
union all select 'original text saved for the undo (expect 2)', (select count(*)::text from public.zz_mt09_function_backup);
