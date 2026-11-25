-- MT_11 (Nov 2026) - multi-tenant step 4d-2: the functions that look a flat (or a bill, or the committee) up now look it up in the LOGIN'S society.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_10. Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table and no data. Undo: MT_11_UNDO.sql (puts every function back exactly as it was; needs the saved copy made here).
--
-- Why: since MT_07 a flat id is only unique INSIDE a society, and these functions run with owner rights (they skip the society wall).
-- "the flat with id A101" is then ambiguous, and "committee flats" means the committee flats of EVERY society:
--   * committee_people()      gave every member the committee of ALL societies                      -> only the login's own society
--   * can_approve_booking()   "nobody is Chairman / Secretary" looked at all societies               -> own society only (both lookups)
--   * my_tenant_flat(), flat_has_tenant_login(), flat_is_rented(), can_assign_areas(), can_approve_letters(), my_flat_is_committee(),
--     flat_people_counts(), bill_is_tenant()                                                         -> every lookup also says "in my society"
--   * area_rights()           used the temporary fallback current_society_or_first()                -> the login's own society (strict)
--   * flat_blockers(p_flats [, p_society])  (server key only) takes the society like MT_09; left out = Aakar's, so today's route keeps working
--     (the route passes the caller's society in the same PR). It also had a fault of its own since MT_07 (see below).
-- A login with no society (no row in society_memberships) now finds nothing in these functions. The society wall (MT_04) already shows such a login
-- no society rows, and MT_03 counted 0 such logins on Aakar, so nothing changes for Aakar.
-- NOT changed on purpose (no lookup of their own, they only call the functions above, or read the login's own token): my_home_flat(),
-- can_set_booking_charge(), my_flat().
--
-- flat_blockers fault found while writing this: it counts rows in every table that points at flats. Since MT_07 those foreign keys are
-- (society_id, flat column), so its list contained the column society_id as well, and "where society_id = <flat id>" cannot work (uuid against text).
-- It now skips that column, counts only the rows of the society asked about, and lists a login as "linked" only if it belongs to that society
-- (or to no society at all: stricter on purpose, a blocker too many is safe, one too few is not).
--
-- Every function is rewritten from its CURRENT live text (the same idea as MT_09): only the society is added, nothing else changes. If a live text
-- has a form this script does not know, it stops with a clear message and changes nothing for that function (the whole script is one batch:
-- an error rolls back everything). The original text of each is first copied into zz_mt11_function_backup (a one-off copy, not society data).
-- Who may call them is untouched (create or replace keeps the grants); flat_blockers stays closed to anon and members.

-- 0. Needs ------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.active_society()') is null then raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).'; end if;
  if to_regprocedure('public.current_society_or_first()') is null then raise exception 'Run MT_06_SETTINGS_PER_SOCIETY.sql first (public.current_society_or_first() is missing).'; end if;
end $$;

-- 1. One-off copy of the functions as they are now --------------------------------------------------------------------------------------
create table if not exists public.zz_mt11_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt11_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt11_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt11_function_backup to service_role;

do $$
declare s text; d text;
begin
  foreach s in array array['public.flat_is_rented(text)', 'public.flat_has_tenant_login(text)', 'public.my_tenant_flat()', 'public.can_assign_areas()',
                           'public.area_rights()', 'public.can_approve_letters()', 'public.can_approve_booking()', 'public.my_flat_is_committee()',
                           'public.committee_people()', 'public.flat_people_counts()', 'public.bill_is_tenant(uuid)', 'public.flat_blockers(text[])'] loop
    if to_regprocedure(s) is not null then
      d := pg_get_functiondef(s::regprocedure);
      -- only the true original: a function that already names the login's society (or, flat_blockers, already takes a society) is never saved over it
      if d !~* 'active_society' and d !~* 'p_society' then
        insert into public.zz_mt11_function_backup (fn, def) values (s, d)
        on conflict (fn) do update set def = excluded.def, saved_at = now();
      end if;
    end if;
  end loop;
end $$;

-- 2. Six functions whose only lookup is "from public.flats f where ..." (can_approve_booking has two) -----------------------------------
do $$
declare
  s text; def text; newdef text; failed text; want int; added int; flats_refs int;
  filt constant text := 'f.society_id = (select public.active_society())';
begin
  foreach s in array array['public.flat_is_rented(text)', 'public.can_assign_areas()', 'public.can_approve_letters()',
                           'public.can_approve_booking()', 'public.my_flat_is_committee()', 'public.committee_people()'] loop
    if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
    def := pg_get_functiondef(s::regprocedure);
    if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; continue; end if;
    want := case when s = 'public.can_approve_booking()' then 2 else 1 end;
    newdef := regexp_replace(def, 'from\s+public\.flats\s+f\s+where\s+', 'from public.flats f where ' || filt || ' and ', 'gi');
    added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
    flats_refs := (select count(*) from regexp_matches(newdef, 'public\.flats', 'gi'));
    failed := concat_ws(', ',
      case when newdef = def then 'nothing was rewritten' end,
      case when added <> want then added || ' society filter(s) added, ' || want || ' expected' end,
      case when flats_refs <> want then flats_refs || ' lookup(s) of public.flats, ' || want || ' expected (another form)' end);
    if failed <> '' then
      raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
    end if;
    execute newdef;
  end loop;
end $$;

-- 3. The two tenant-login lookups -------------------------------------------------------------------------------------------------------
do $$
declare
  s text; def text; newdef text; failed text;
begin
  foreach s in array array['public.flat_has_tenant_login(text)', 'public.my_tenant_flat()'] loop
    if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
    def := pg_get_functiondef(s::regprocedure);
    if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; continue; end if;
    -- the flat joined to its tenant login must be the flat of the SAME society
    newdef := regexp_replace(def, 'join\s+public\.flats\s+f\s+on\s+f\.id\s*=\s*t\.flat_id', 'join public.flats f on f.society_id = t.society_id and f.id = t.flat_id', 'gi');
    if s = 'public.flat_has_tenant_login(text)' then
      newdef := regexp_replace(newdef, 'where\s+t\.flat_id\s*=\s*p_flat', 'where t.society_id = (select public.active_society()) and t.flat_id = p_flat', 'gi');
    else
      newdef := regexp_replace(newdef, 'where\s+t\.user_id\s*=\s*auth\.uid\(\)', 'where t.society_id = (select public.active_society()) and t.user_id = auth.uid()', 'gi');
    end if;
    failed := concat_ws(', ',
      case when newdef = def then 'nothing was rewritten' end,
      case when newdef !~ 'join public\.flats f on f\.society_id = t\.society_id and f\.id = t\.flat_id' then 'the join was not found' end,
      case when newdef !~ 't\.society_id = \(select public\.active_society\(\)\) and t\.(flat_id = p_flat|user_id = auth\.uid\(\))' then 'the where was not found' end);
    if failed <> '' then
      raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
    end if;
    execute newdef;
  end loop;
end $$;

-- 4. flat_people_counts ------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.flat_people_counts()'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- members of this society only; the old "A or B" is wrapped in brackets so the society filter applies to both
  newdef := regexp_replace(def, 'from\s+public\.members\s+m\s+where\s+public\.is_committee\(\)\s+or\s+exists\s*\(',
                                'from public.members m where m.society_id = (select public.active_society()) and (public.is_committee() or exists (', 'gi');
  newdef := regexp_replace(newdef, '\)\s+group\s+by\s+m\.flat_id', ')) group by m.flat_id', 'gi');
  -- the event team of this society only
  newdef := regexp_replace(newdef, 'from\s+public\.event_team\s+t\s+where\s+', 'from public.event_team t where t.society_id = (select public.active_society()) and ', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'm\.society_id = \(select public\.active_society\(\)\) and \(public\.is_committee\(\) or exists \(' then 'the members lookup was not found' end,
    case when newdef !~ 't\.society_id = \(select public\.active_society\(\)\) and ' then 'the event team lookup was not found' end,
    case when newdef !~ '\)\) group by m\.flat_id' then 'the group by was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 5. bill_is_tenant ----------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.bill_is_tenant(uuid)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  newdef := regexp_replace(def, 'from\s+public\.bills\s+b\s+where\s+b\.id\s*=\s*p_bill', 'from public.bills b where b.society_id = (select public.active_society()) and b.id = p_bill', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'b\.society_id = \(select public\.active_society\(\)\) and b\.id = p_bill' then 'the bill lookup was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 6. area_rights: the login's own society, no temporary fallback --------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.area_rights()'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def !~* 'current_society_or_first' then raise notice '% no longer uses the temporary fallback', s; return; end if;
  newdef := regexp_replace(def, 'public\.current_society_or_first\(\)', '(select public.active_society())', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef ~* 'current_society_or_first' then 'the fallback is still there' end,
    case when newdef !~ 'society_id\s*=\s*\(select public\.active_society\(\)\)\s+and\s+id\s*=\s*1' then 'the settings lookup has another form' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 7. flat_blockers: takes the society, counts only that society's rows, skips the society_id column --------------------------------------
do $$
declare
  s constant text := 'public.flat_blockers(text[])'; def text; newdef text; failed text;
begin
  if to_regprocedure('public.flat_blockers(text[],uuid)') is not null then raise notice 'flat_blockers already takes a society'; return; end if;
  if to_regprocedure(s) is null then raise notice 'flat_blockers not found (sql-security/15 not run); skipped'; return; end if;
  def := pg_get_functiondef(s::regprocedure);
  newdef := def;
  -- the society this call is about (left out = Aakar's: the server calls it with its own key, there is no login)
  newdef := regexp_replace(newdef, 'flat_blockers\(p_flats text\[\]\)', 'flat_blockers(p_flats text[], p_society uuid DEFAULT NULL::uuid)');
  newdef := regexp_replace(newdef, '\$function\$(\s*)declare', '$function$\1declare v_society uuid := coalesce(p_society, public.current_society_or_first());');
  -- the flat itself
  newdef := regexp_replace(newdef, 'from\s+public\.flats\s+x\s+where\s+x\.id\s*=\s*fid', 'from public.flats x where x.society_id = v_society and x.id = fid', 'gi');
  -- the tables that point at flats: not the society_id column of the key itself
  newdef := regexp_replace(newdef, 'a\.attnum\s*=\s*any\s*\(\s*kk\.conkey\s*\)', 'a.attnum = any (kk.conkey) and a.attname <> ''society_id''', 'gi');
  -- the counts: this society's rows (a table with no society_id is still counted in full: stricter)
  newdef := regexp_replace(newdef,
    'execute\s+format\(''select count\(\*\) from public\.%I where %I = \$1'', c\.tab, c\.col\)\s+into\s+n\s+using\s+fid;',
    'if exists (select 1 from information_schema.columns where table_schema = ''public'' and table_name = c.tab and column_name = ''society_id'') then '
    || 'execute format(''select count(*) from public.%I where society_id = $2 and %I = $1'', c.tab, c.col) into n using fid, v_society; '
    || 'else execute format(''select count(*) from public.%I where %I = $1'', c.tab, c.col) into n using fid; end if;', 'gi');
  newdef := regexp_replace(newdef,
    'execute\s+''select count\(\*\) from public\.committee_areas where \$1 = any \(backup_flats\)''\s+into\s+n\s+using\s+fid;',
    'execute ''select count(*) from public.committee_areas where society_id = $2 and $1 = any (backup_flats)'' into n using fid, v_society;', 'gi');
  -- a login counts as linked only if it belongs to this society (or to none)
  newdef := regexp_replace(newdef,
    'where\s+u\.raw_app_meta_data\s*->>\s*''flat_id''\s*=\s*fid\s+or\s+u\.raw_app_meta_data\s*->>\s*''tenant_flat''\s*=\s*fid\)',
    'where (u.raw_app_meta_data ->> ''flat_id'' = fid or u.raw_app_meta_data ->> ''tenant_flat'' = fid) '
    || 'and (exists (select 1 from public.society_memberships sm where sm.user_id = u.id and sm.society_id = v_society) '
    || 'or not exists (select 1 from public.society_memberships sm where sm.user_id = u.id)))', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'p_society uuid DEFAULT NULL' then 'the argument list was not found' end,
    case when newdef !~ 'declare v_society uuid' then 'the declare line was not found' end,
    case when newdef !~ 'x\.society_id = v_society and x\.id = fid' then 'the flat lookup was not found' end,
    case when newdef !~ 'a\.attname <> ''society_id''' then 'the key column list was not found' end,
    case when newdef !~ 'society_id = \$2 and %I = \$1' then 'the row count was not found' end,
    case when newdef !~ 'committee_areas where society_id = \$2' then 'the backup flats count was not found' end,
    case when newdef !~ 'sm\.society_id = v_society' then 'the linked login check was not found' end);
  if failed <> '' then
    raise exception 'flat_blockers() has an unexpected form (%); nothing was changed. Send me its text.', failed;
  end if;
  execute newdef;
  drop function public.flat_blockers(text[]);
  revoke all on function public.flat_blockers(text[], uuid) from public, anon, authenticated;
  grant execute on function public.flat_blockers(text[], uuid) to service_role;
end $$;

-- 8. Check ------------------------------------------------------------------------------------------------------------------------------
select 'the 11 lookup functions name the login''s society (expect 11)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('flat_is_rented', 'flat_has_tenant_login', 'my_tenant_flat', 'can_assign_areas', 'area_rights', 'can_approve_letters',
                             'can_approve_booking', 'my_flat_is_committee', 'committee_people', 'flat_people_counts', 'bill_is_tenant')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value
union all select 'area_rights no longer uses the temporary fallback (expect yes)',
       case when pg_get_functiondef('public.area_rights()'::regprocedure) !~* 'current_society_or_first' then 'yes' else 'NO' end
union all select 'flat_blockers takes a society, old form gone (expect yes)',
       case when to_regprocedure('public.flat_blockers(text[],uuid)') is not null and to_regprocedure('public.flat_blockers(text[])') is null then 'yes' else 'NO' end
union all select 'flat_blockers: server key only (expect true / false)',
       coalesce((has_function_privilege('service_role', 'public.flat_blockers(text[],uuid)', 'execute')::text || ' / '
                 || (has_function_privilege('anon', 'public.flat_blockers(text[],uuid)', 'execute') or has_function_privilege('authenticated', 'public.flat_blockers(text[],uuid)', 'execute'))::text), 'not found')
union all select 'original text saved for the undo (expect 12)', (select count(*)::text from public.zz_mt11_function_backup);
