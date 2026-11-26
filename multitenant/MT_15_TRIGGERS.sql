-- MT_15 (Nov 2026) - multi-tenant step 4d-7 (group D): three trigger functions only look at rows of THE ROW'S OWN society.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_14. Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table, no trigger and no data. Undo: MT_15_UNDO.sql (puts the three functions back exactly as they were; needs the saved copy made here).
--
-- Why: trigger functions run with owner rights (they skip the society wall) and look at other tables by flat id / template id alone:
--   * tenant_moved_out()           when a flat's occupancy went from "tenant" to anything else, it switched off the tenant login of EVERY flat with that id
--                                  - so flat A101 of society A moving a tenant out also switched off the tenant login of A101 in society B   -> this flat's society only
--   * committee_areas_guard()      "the responsible member / backup must be on the committee" looked for ANY flat with that id on the committee, so a flat of
--                                  another society (same id) passed the check; the backup limit was read from the login's society (or Aakar's from the SQL Editor)
--                                                                                                                                        -> the area's own society, both
--   * letter_request_before_insert() looked the letter format (template) up by id alone, so a member could name another society's format and learn which
--                                  fields it asks for ("Please fill in: ...")                                                             -> this society's format; another society's is
--                                  treated as not found (nothing asked, no details kept)
-- NOT changed on purpose (they read no other society's rows; the helpers they call were made society-aware in MT_11):
--   * event_team_tenant_guard()    calls flat_has_tenant_login(), which looks in the login's society; a write through the server key has no login and is not checked
--   * letter_request_guard()       calls can_approve_letters() and my_flat() only
--   * letters_resolution_guard()   calls can_approve_letters() only
-- Also not changed: is_main_admin() (who is the main admin of a society is decided with the platform-owner step).
--
-- Every function is rewritten from its CURRENT live text (as MT_09 - MT_14): only the society is added. If a live text has a form this script does not
-- know, it stops with a clear message and changes nothing (the whole script is one batch: an error rolls back everything). The original text of each is first
-- copied into zz_mt15_function_backup (a one-off copy, not society data). The triggers themselves stay as they are (create or replace keeps them).

-- 0. Needs ------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.active_society()') is null then raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).'; end if;
  if pg_get_functiondef('public.can_assign_areas()'::regprocedure) !~ 'active_society' then raise exception 'Run MT_11_FLAT_LOOKUPS.sql first (can_assign_areas() does not look in the login''s society yet).'; end if;
end $$;

-- 1. One-off copy of the functions as they are now --------------------------------------------------------------------------------------
create table if not exists public.zz_mt15_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt15_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt15_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt15_function_backup to service_role;

do $$
declare s text; d text;
begin
  foreach s in array array['public.tenant_moved_out()', 'public.committee_areas_guard()', 'public.letter_request_before_insert()'] loop
    if to_regprocedure(s) is not null then
      d := pg_get_functiondef(s::regprocedure);
      -- only the true original: a function that already names the row's society is never saved over it
      if d !~* 'new\.society_id' then
        insert into public.zz_mt15_function_backup (fn, def) values (s, d)
        on conflict (fn) do update set def = excluded.def, saved_at = now();
      end if;
    end if;
  end loop;
end $$;

-- 2. The patch helper (a temporary function: gone when the SQL Editor session ends, nothing is left in the database) -----------------------
-- For one function: every pattern must be found exactly the expected number of times in the live text, each is replaced, and no "left over" pattern may remain.
create or replace function pg_temp.mt15_patch(s text, pats text[], repls text[], wants int[], leftover text[])
returns void language plpgsql as $f$
declare def text; newdef text; failed text := ''; n int; i int;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'new\.society_id' then raise notice '% already looks in the row''s society', s; return; end if;
  newdef := def;
  for i in 1 .. array_length(pats, 1) loop
    n := (select count(*) from regexp_matches(newdef, pats[i], 'gi'));
    if n <> wants[i] then failed := concat_ws(', ', nullif(failed, ''), 'step ' || i || ': found ' || n || ' time(s), ' || wants[i] || ' expected'); end if;
    newdef := regexp_replace(newdef, pats[i], repls[i], 'gi');
  end loop;
  if leftover is not null then
    for i in 1 .. array_length(leftover, 1) loop
      if newdef ~* leftover[i] then failed := concat_ws(', ', nullif(failed, ''), 'a lookup without the society is left (' || i || ')'); end if;
    end loop;
  end if;
  if newdef = def then failed := concat_ws(', ', nullif(failed, ''), 'nothing was rewritten'); end if;
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $f$;

-- 3. The three functions ----------------------------------------------------------------------------------------------------------------
-- tenant_moved_out: only the tenant login of THIS flat (same society) is switched off
select pg_temp.mt15_patch('public.tenant_moved_out()',
  array['where\s+flat_id\s*=\s*new\.id\s+and\s+active'],
  array['where society_id = new.society_id and flat_id = new.id and active'],
  array[1], array['where\s+flat_id\s*=\s*new\.id']);

-- committee_areas_guard: the backup limit and the "is on the committee" check use the area's own society
select pg_temp.mt15_patch('public.committee_areas_guard()',
  array['where\s+society_id\s*=\s*public\.current_society_or_first\(\)\s+and\s+id\s*=\s*1',
        'where\s+not\s*\(\s*x\s*=\s*any\s*\(\s*was\s*\)\s*\)\s+and\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.flats\s+f\s+where\s+f\.id\s*=\s*x\s+and\s+f\.is_committee\s*\)'],
  array['where society_id = new.society_id and id = 1',
        'where not (x = any (was)) and not exists (select 1 from public.flats f where f.society_id = new.society_id and f.id = x and f.is_committee)'],
  array[1, 1], array['where\s+f\.id', 'current_society_or_first']);

-- letter_request_before_insert: the letter format is looked up in the request's own society
select pg_temp.mt15_patch('public.letter_request_before_insert()',
  array['from\s+public\.letter_templates\s+where\s+id\s*=\s*new\.template_id'],
  array['from public.letter_templates where society_id = new.society_id and id = new.template_id'],
  array[1], array['where\s+id\s*=\s*new\.template_id']);

-- 4. Check ------------------------------------------------------------------------------------------------------------------------------
select 'the 3 trigger functions name the row''s society (expect 3)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('tenant_moved_out', 'committee_areas_guard', 'letter_request_before_insert')
           and pg_get_functiondef(p.oid) ~ 'new\.society_id')::text as value
union all select 'the three triggers are still attached and enabled (expect 3)',
       (select count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled <> 'D'
           and t.tgname in ('tenant_moved_out', 'committee_areas_guard', 'letter_request_before_insert'))::text
union all select 'the 3 not-changed-on-purpose functions are untouched (expect 0 naming new.society_id)',
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('event_team_tenant_guard', 'letter_request_guard', 'letters_resolution_guard')
           and pg_get_functiondef(p.oid) ~ 'new\.society_id')::text
union all select 'original text saved for the undo (expect 3)', (select count(*)::text from public.zz_mt15_function_backup);
