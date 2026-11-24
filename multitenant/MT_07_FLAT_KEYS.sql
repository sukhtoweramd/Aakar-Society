-- MT_07 (Nov 2026) - multi-tenant step 4c-3: flat ids, tower codes and nomination rows become unique PER SOCIETY.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_06 and AFTER the app with PR "MT_07" (nomination form received saved without upsert) is live.
-- Try it on the test project ("aanganone") first. Safe to run again. Changes no data. Undo: MT_07_UNDO.sql (only while no two societies share a flat id).
--
-- Why: flat "A101" may exist only once in the whole database today (key = id). Every society needs its own A101.
--   1. flats: key (id) -> (society_id, id). Every foreign key that points at flats (about 19, found from the live database, same names, same delete / update
--      rules) is dropped and made again as (society_id, flat column) -> flats (society_id, id), so a row can only point at a flat of ITS OWN society.
--      "ON DELETE SET NULL" becomes "SET NULL (flat column)" (PostgreSQL 15 or newer) so the society column is never emptied.
--   2. flats_tower_check (towers A, B, C only) is dropped: the towers of a society are the rows of its towers table (ADMIN -> FLAT SETUP).
--   3. towers: key (code) -> (society_id, code); the guard that stops a tower in use from being deleted / renamed counts only the society's own flats.
--   4. nomination_status: key (flat_id) -> (society_id, flat_id); the trigger nominees_changed (which writes it with "on conflict (flat_id)") is
--      rewritten from its live text to write and conflict on (society_id, flat_id). Without that, every nominee save would fail.
-- For Aakar nothing is different: one society, same ids, same links.
--
-- IMPORTANT: from this script on, a SECOND society must not reuse flat ids on the real database until step 4d is done: several database functions
-- (flat_is_rented, flat_blockers, the three directory views ...) still look a flat up by its id alone. Aakar is not affected (one society).
-- NOT here: the society_id default (step 4c-4), the society checks in those functions and views (step 4d).

-- 1. flats: key and links ------------------------------------------------------------------------------------------------------------------
do $$
declare
  cols text;
  pk text;
  missing text;
  bad text;
  fk record;
  col text;
  newdef text;
  n int := 0;
begin
  if to_regclass('public.flats') is null then raise notice 'no flats table'; return; end if;
  select con.conname, (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any (con.conkey))
    into pk, cols from pg_constraint con where con.conrelid = 'public.flats'::regclass and con.contype = 'p';
  if cols = 'id,society_id' then raise notice 'flats key already (society_id, id)'; return; end if;

  select string_agg(distinct con.conrelid::regclass::text, ', ') into missing from pg_constraint con
   where con.confrelid = 'public.flats'::regclass and con.contype = 'f'
     and not exists (select 1 from pg_attribute a where a.attrelid = con.conrelid and a.attname = 'society_id' and not a.attisdropped);
  if missing is not null then raise exception 'These tables point at flats but have no society_id (run MT_02 first): %', missing; end if;

  select string_agg(con.conname, ', ') into bad from pg_constraint con
   where con.confrelid = 'public.flats'::regclass and con.contype = 'f' and array_length(con.conkey, 1) <> 1;
  if bad is not null then raise exception 'Links to flats over more than one column are not expected: %', bad; end if;

  select string_agg(con.conname, ', ') into bad from pg_constraint con
   where con.confrelid = 'public.flats'::regclass and con.contype = 'f' and pg_get_constraintdef(con.oid) !~ 'REFERENCES (public\.)?flats\(id\)';
  if bad is not null then raise exception 'Links to flats that do not use the id column are not expected: %', bad; end if;

  if current_setting('server_version_num')::int < 150000 and exists (
       select 1 from pg_constraint con where con.confrelid = 'public.flats'::regclass and con.contype = 'f' and pg_get_constraintdef(con.oid) ~ 'SET (NULL|DEFAULT)') then
    raise exception 'ON DELETE SET NULL (column) needs PostgreSQL 15 or newer.';
  end if;

  create temp table mt07_fks on commit drop as
    select con.conname::text as conname, con.conrelid::regclass::text as tbl, pg_get_constraintdef(con.oid) as def
      from pg_constraint con where con.confrelid = 'public.flats'::regclass and con.contype = 'f';

  for fk in select * from mt07_fks loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
  end loop;
  execute format('alter table public.flats drop constraint %I', pk);
  alter table public.flats add constraint flats_pkey primary key (society_id, id);

  for fk in select * from mt07_fks loop
    col := (regexp_match(fk.def, 'FOREIGN KEY \(([^)]*)\)'))[1];
    newdef := regexp_replace(fk.def, 'FOREIGN KEY \(([^)]*)\)', 'FOREIGN KEY (society_id, \1)');
    newdef := regexp_replace(newdef, 'REFERENCES (public\.)?flats\(id\)', 'REFERENCES public.flats(society_id, id)');
    newdef := regexp_replace(newdef, 'ON DELETE SET (NULL|DEFAULT)', 'ON DELETE SET \1 (' || col || ')');
    newdef := regexp_replace(newdef, 'ON UPDATE SET (NULL|DEFAULT)', 'ON UPDATE SET \1 (' || col || ')');
    execute format('alter table %s add constraint %I %s', fk.tbl, fk.conname, newdef);
    n := n + 1;
  end loop;
  raise notice 'flats key changed; % links to flats made again with the society', n;
end $$;

alter table if exists public.flats drop constraint if exists flats_tower_check;

-- 2. towers and nomination_status: keys -----------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  k text;
  pk text;
  cols text;
  refs text;
begin
  for t, k in select * from (values ('towers', 'code'), ('nomination_status', 'flat_id')) v(t, k) loop
    if to_regclass('public.' || t) is null then continue; end if;
    select con.conname, (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any (con.conkey))
      into pk, cols from pg_constraint con where con.conrelid = ('public.' || t)::regclass and con.contype = 'p';
    if cols = k || ',society_id' or (k = 'code' and cols = 'code,society_id') then continue; end if;
    select string_agg(con.conrelid::regclass::text, ', ') into refs from pg_constraint con where con.confrelid = ('public.' || t)::regclass and con.contype = 'f';
    if refs is not null then raise exception 'Tables point at % (not expected): %', t, refs; end if;
    if pk is not null then execute format('alter table public.%I drop constraint %I', t, pk); end if;
    execute format('alter table public.%I add constraint %I primary key (society_id, %I)', t, t || '_pkey', k);
  end loop;
end $$;

-- 3. functions that name the old keys, rewritten from their live text (stop with a clear message if the live text is not the expected one) -------
do $$
declare
  def text;
  newdef text;
begin
  if to_regprocedure('public.towers_guard()') is not null
     and (select prosrc from pg_proc where oid = 'public.towers_guard()'::regprocedure) not like '%f.society_id = old.society_id%' then
    def := pg_get_functiondef('public.towers_guard()'::regprocedure);
    newdef := replace(def, 'where trim(f.tower) = old.code', 'where f.society_id = old.society_id and trim(f.tower) = old.code');
    if newdef = def then raise exception 'towers_guard() has an unexpected form; nothing was changed. Send me its text.'; end if;
    execute newdef;
  end if;

  if to_regprocedure('public.nominees_changed()') is not null
     and (select prosrc from pg_proc where oid = 'public.nominees_changed()'::regprocedure) not like '%on conflict (society_id, flat_id)%' then
    def := pg_get_functiondef('public.nominees_changed()'::regprocedure);
    newdef := replace(def, 'insert into public.nomination_status (flat_id,', 'insert into public.nomination_status (society_id, flat_id,');
    newdef := replace(newdef, 'values (fid,', 'values (coalesce(new.society_id, old.society_id), fid,');
    newdef := replace(newdef, 'on conflict (flat_id)', 'on conflict (society_id, flat_id)');
    if newdef = def or newdef not like '%insert into public.nomination_status (society_id, flat_id,%'
       or newdef not like '%values (coalesce(new.society_id, old.society_id), fid,%' or newdef not like '%on conflict (society_id, flat_id)%' then
      raise exception 'nominees_changed() has an unexpected form; nothing was changed. Send me its text.';
    end if;
    execute newdef;
  end if;
end $$;

-- 4. Check ---------------------------------------------------------------------------------------------------------------------------------
select 'flats key is (society_id, id) (expect yes)' as what,
  case when (select string_agg(a.attname, ',' order by a.attname) from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
             where con.conrelid = 'public.flats'::regclass and con.contype = 'p') = 'id,society_id' then 'yes' else 'NO' end as value
union all select 'links to flats that include the society (expect the same number as all links to flats)',
  (select count(*)::text from pg_constraint con where con.confrelid = 'public.flats'::regclass and con.contype = 'f' and array_length(con.conkey, 1) = 2)
  || ' of ' || (select count(*)::text from pg_constraint con where con.confrelid = 'public.flats'::regclass and con.contype = 'f')
union all select 'towers / nomination_status keys include the society (expect yes / yes)',
  coalesce((select case when (select string_agg(a.attname, ',' order by a.attname) from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
                              where con.conrelid = 'public.towers'::regclass and con.contype = 'p') = 'code,society_id' then 'yes' else 'NO' end where to_regclass('public.towers') is not null), '-')
  || ' / ' ||
  coalesce((select case when (select string_agg(a.attname, ',' order by a.attname) from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
                              where con.conrelid = 'public.nomination_status'::regclass and con.contype = 'p') = 'flat_id,society_id' then 'yes' else 'NO' end where to_regclass('public.nomination_status') is not null), '-')
union all select 'flats_tower_check gone (expect yes)', case when exists (select 1 from pg_constraint where conname = 'flats_tower_check') then 'NO' else 'yes' end
union all select 'towers_guard counts inside the society / nominees_changed writes (society_id, flat_id) (expect yes / yes)',
  coalesce((select case when prosrc like '%f.society_id = old.society_id%' then 'yes' else 'NO' end from pg_proc where oid = to_regprocedure('public.towers_guard()')), '-')
  || ' / ' ||
  coalesce((select case when prosrc like '%on conflict (society_id, flat_id)%' then 'yes' else 'NO' end from pg_proc where oid = to_regprocedure('public.nominees_changed()')), '-');
