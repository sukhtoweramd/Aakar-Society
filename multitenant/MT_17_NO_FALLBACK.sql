-- MT_17 (Nov 2026) - multi-tenant step 4d-8: no more silent "first society" fallback in the database.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_16 and after the app of PR "4e-0" is live. Try it on the test project ("aanganone") first.
-- Safe to run again. Changes no data. Undo: MT_17_UNDO.sql (puts everything back exactly as it was; needs the saved copies made here).
--
-- Until now a call that did not say which society it is for quietly became the FIRST society (Aakar):
--   * 39 tables had   society_id ... default public.current_society_or_first()   (a login's own society, else Aakar's for server-key / SQL Editor calls)
--   * clear_test_documents(), flat_blockers(), restore_society_backup() took  p_society default null  =  Aakar's
--   * next_doc_numbers() (bill / receipt / letter numbers) used current_society_or_first()
--   * is_committee() let a role-"committee" login with NO membership count as committee (transition rule)
-- After this script:
--   * the 39 defaults are  public.active_society()  (the login's own society): a login's own inserts still get its society; an insert through the server key
--     or the SQL Editor that forgets to name its society now FAILS (not null) instead of landing in Aakar
--   * the three functions refuse a call with no society ("Society missing ...") - every route already passes it
--   * next_doc_numbers() counts the login's own society only
--   * is_committee() = role "committee" AND a committee / society_admin membership of the active society (no exception for logins without a membership)
--   * public.current_society_or_first() is dropped
-- Stops (changes nothing) if a login with a role has no membership, or if a function has a form this script does not know.
-- NOT changed on purpose: is_main_admin() still has a branch for a login with no membership; it can no longer be reached (is_committee() is false for such a login).
-- After this, any NEW script or function that inserts into a society table must name society_id itself.

-- 0. Needs ------------------------------------------------------------------------------------------------------------------------------
do $$
declare n int;
begin
  if to_regprocedure('public.active_society()') is null then raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).'; end if;
  if to_regprocedure('public.flat_blockers(text[], uuid)') is null or pg_get_functiondef('public.flat_blockers(text[], uuid)'::regprocedure) !~ 'p_society' then
    raise exception 'Run MT_11_FLAT_LOOKUPS.sql first (flat_blockers has no society).';
  end if;
  select count(*) into n from auth.users u
   where u.raw_app_meta_data ->> 'role' in ('committee', 'resident', 'tenant')
     and not exists (select 1 from public.society_memberships m where m.user_id = u.id);
  if n > 0 then
    raise exception '% login(s) have a role but belong to no society. Give each a membership first (or remove it); nothing was changed.', n;
  end if;
end $$;

-- 1. One-off copies of what is changed ---------------------------------------------------------------------------------------------------
create table if not exists public.zz_mt17_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt17_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt17_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt17_function_backup to service_role;

create table if not exists public.zz_mt17_default_backup (
  tbl      text not null,
  col      text not null,
  saved_at timestamptz not null default now(),
  primary key (tbl, col)
);
alter table public.zz_mt17_default_backup enable row level security;
revoke all on public.zz_mt17_default_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt17_default_backup to service_role;

do $$
declare s text; d text;
begin
  foreach s in array array['public.clear_test_documents(integer, integer, integer, integer, uuid)', 'public.flat_blockers(text[], uuid)',
                           'public.restore_society_backup(jsonb, uuid)', 'public.next_doc_numbers(text, integer)',
                           'public.is_committee()', 'public.current_society_or_first()'] loop
    if to_regprocedure(s) is not null then
      d := pg_get_functiondef(s::regprocedure);
      -- only the true original: a function that no longer has the fallback is never saved over it
      if d ~* 'current_society_or_first' or d ~* 'not\s+exists\s*\(\s*select\s+1\s+from\s+public\.society_memberships' or s = 'public.current_society_or_first()' then
        insert into public.zz_mt17_function_backup (fn, def) values (s, d)
        on conflict (fn) do update set def = excluded.def, saved_at = now();
      end if;
    end if;
  end loop;
  -- the columns whose default is the old function (so the undo can put exactly those back)
  insert into public.zz_mt17_default_backup (tbl, col)
  select c.relname, a.attname
    from pg_attrdef df join pg_class c on c.oid = df.adrelid join pg_attribute a on a.attrelid = df.adrelid and a.attnum = df.adnum
   where c.relnamespace = 'public'::regnamespace and pg_get_expr(df.adbin, df.adrelid) like '%current_society_or_first%'
  on conflict do nothing;
end $$;

-- 2. A helper that refuses "no society" ------------------------------------------------------------------------------------------------------
create or replace function public.require_society(p uuid) returns uuid
language plpgsql stable set search_path = public as $$
begin
  if p is null then raise exception 'Society missing: this call must say which society it is for.'; end if;
  return p;
end $$;
revoke all on function public.require_society(uuid) from public, anon;
grant execute on function public.require_society(uuid) to authenticated, service_role;

-- 3. The patch helper (a temporary function: gone when the SQL Editor session ends, nothing is left in the database) -----------------------------
-- original = a pattern that is in the function only while it still has the old form (nothing to do when it is gone).
-- Every pattern must be found exactly the expected number of times, each is replaced, no "left over" pattern may remain, and every "must" pattern must still be there.
create or replace function pg_temp.mt17_patch(s text, original text, pats text[], repls text[], wants int[], leftover text[], must text[])
returns void language plpgsql as $f$
declare def text; newdef text; failed text := ''; n int; i int;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def !~* original then raise notice '% is already changed', s; return; end if;
  newdef := def;
  for i in 1 .. array_length(pats, 1) loop
    n := (select count(*) from regexp_matches(newdef, pats[i], 'gi'));
    if n <> wants[i] then failed := concat_ws(', ', nullif(failed, ''), 'step ' || i || ': found ' || n || ' time(s), ' || wants[i] || ' expected'); end if;
    newdef := regexp_replace(newdef, pats[i], repls[i], 'gi');
  end loop;
  if leftover is not null then
    for i in 1 .. array_length(leftover, 1) loop
      if newdef ~* leftover[i] then failed := concat_ws(', ', nullif(failed, ''), 'old form left (' || i || ')'); end if;
    end loop;
  end if;
  if must is not null then
    for i in 1 .. array_length(must, 1) loop
      if newdef !~* must[i] then failed := concat_ws(', ', nullif(failed, ''), 'expected part missing (' || i || ')'); end if;
    end loop;
  end if;
  if newdef = def then failed := concat_ws(', ', nullif(failed, ''), 'nothing was rewritten'); end if;
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $f$;

-- 4. The functions ----------------------------------------------------------------------------------------------------------------------------
-- the three that took "p_society default null": null now means "refuse"
select pg_temp.mt17_patch(f.sig, 'current_society_or_first',
  array['coalesce\s*\(\s*p_society\s*,\s*public\.current_society_or_first\(\s*\)\s*\)'],
  array['public.require_society(p_society)'],
  array[1], array['current_society_or_first', 'coalesce\s*\(\s*p_society'], array['require_society\(p_society\)'])
  from (values ('public.clear_test_documents(integer, integer, integer, integer, uuid)'), ('public.flat_blockers(text[], uuid)'),
               ('public.restore_society_backup(jsonb, uuid)')) as f(sig);

-- next_doc_numbers: the four counters of the login's own society
select pg_temp.mt17_patch('public.next_doc_numbers(text, integer)', 'current_society_or_first',
  array['public\.current_society_or_first\(\s*\)'],
  array['(select public.active_society())'],
  array[4], array['current_society_or_first'], array['where\s+society_id\s*=\s*\(select public\.active_society\(\)\)\s+and\s+id\s*=\s*1']);

-- is_committee: no exception for a login without a membership
select pg_temp.mt17_patch('public.is_committee()', 'not\s+exists\s*\(\s*select\s+1\s+from\s+public\.society_memberships',
  array['\s+or\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.society_memberships\s+m\s+where\s+m\.user_id\s*=\s*auth\.uid\(\)\s*\)[ \t]*(--[^\n]*)?'],
  array[''],
  array[1], array['not\s+exists\s*\(\s*select\s+1\s+from\s+public\.society_memberships'],
  array['m\.society_id\s*=\s*public\.active_society\(\)', 'm\.role\s+in\s*\(\s*''committee''\s*,\s*''society_admin''\s*\)']);

-- 5. The 39 column defaults -------------------------------------------------------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in select c.relname as tbl, a.attname as col
             from pg_attrdef df join pg_class c on c.oid = df.adrelid join pg_attribute a on a.attrelid = df.adrelid and a.attnum = df.adnum
            where c.relnamespace = 'public'::regnamespace and pg_get_expr(df.adbin, df.adrelid) like '%current_society_or_first%' loop
    execute format('alter table public.%I alter column %I set default public.active_society()', r.tbl, r.col);
    n := n + 1;
  end loop;
  raise notice '% column default(s) changed to active_society()', n;
end $$;

-- 6. The old function goes (this stops with an error, and changes nothing, if anything still uses it) ------------------------------------------------
drop function if exists public.current_society_or_first();

-- 7. Check ------------------------------------------------------------------------------------------------------------------------------------
select 'functions that still use current_society_or_first (expect none)' as what,
       coalesce((select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
                  and pg_get_functiondef(p.oid) like '%current_society_or_first%'), 'none') as value
union all select 'society_id columns whose default is active_society() (expect 39)',
       (select count(*) from pg_attrdef df join pg_class c on c.oid = df.adrelid join pg_attribute a on a.attrelid = df.adrelid and a.attnum = df.adnum
         where c.relnamespace = 'public'::regnamespace and a.attname = 'society_id' and pg_get_expr(df.adbin, df.adrelid) like '%active_society()%')::text
union all select 'columns that still default to the old function (expect 0)',
       (select count(*) from pg_attrdef df join pg_class c on c.oid = df.adrelid
         where c.relnamespace = 'public'::regnamespace and pg_get_expr(df.adbin, df.adrelid) like '%current_society_or_first%')::text
union all select 'the 3 functions refuse a call with no society (expect 3)',
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('clear_test_documents', 'flat_blockers', 'restore_society_backup')
           and pg_get_functiondef(p.oid) like '%require_society(p_society)%')::text
union all select 'is_committee has no rule for logins without a membership (expect true)',
       (pg_get_functiondef('public.is_committee()'::regprocedure) !~* 'not\s+exists\s*\(\s*select\s+1\s+from\s+public\.society_memberships')::text
union all select 'old function dropped (expect true)', (to_regprocedure('public.current_society_or_first()') is null)::text
union all select 'originals saved for the undo (expect 6 functions, 39 columns)',
       (select count(*) from public.zz_mt17_function_backup)::text || ' / ' || (select count(*) from public.zz_mt17_default_backup)::text;
