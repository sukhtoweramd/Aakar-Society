-- Renumber the B building (28 Oct 2026, confirmed by the Secretary). ONE-TIME script.
--   2 BHK flats are positions 3–6 of every floor:  app B101 B102 B103 B104  →  B103 B104 B105 B106  (same on every floor)
--   4 BHK homes are positions 1 + 2 joined, one owner, one share certificate, one maintenance bill:
--       app C101 → B101 (shown "B-101/102", still listed under Tower C), C201 → B201 …
--   Tower A does not change.
-- Every table that stores a flat number is moved to the new number (family, vehicles, bills, receipts, letters,
-- bookings, complaints, nominees, events, committee areas …); nothing is deleted.
--
-- BEFORE: ADMIN → BACKUP & RESTORE → DOWNLOAD FULL BACKUP (so it can be undone with RESTORE).
-- AFTER:  take a new backup (older backups still have the old numbers).
--
-- The script checks first and stops WITHOUT CHANGING ANYTHING if:
--   • a B flat is at a position other than 1–4, or a C flat at a position other than 1 (numbering not as expected)
--   • a flat login (or committee login) is linked to a B or C flat: delete / unlink it first, create it again after
--   • it was already run (no C flats left)
-- Files already uploaded for a B / C flat (test documents) stay in storage; members of the renumbered flat may not
-- open those old test files any more (the committee still can). Upload real documents after renumbering.

do $$
declare
  m record; c record; n int := 0; bad text; tabs text[] := '{}'; t text; code text; has_code boolean;
begin
  -- 1. The plan: old number → new number
  create temp table renum (old text primary key, new text not null unique, flat_no text not null, ord int not null) on commit drop;
  insert into renum
    select f.id, 'B' || left(substr(f.id, 2), -2) || lpad((right(f.id, 2)::int + 2)::text, 2, '0'),
           'B' || left(substr(f.id, 2), -2) || lpad((right(f.id, 2)::int + 2)::text, 2, '0'),
           10 - right(f.id, 2)::int                                   -- B?04 first, so every new number is free when used
      from public.flats f where f.id ~ '^B[0-9]{3,4}$';
  insert into renum
    select f.id, 'B' || left(substr(f.id, 2), -2) || '01',
           'B' || left(substr(f.id, 2), -2) || '01/' || left(substr(f.id, 2), -2) || '02',
           100                                                        -- after the B flats have moved up
      from public.flats f where f.id ~ '^C[0-9]{3,4}$';

  -- 2. Checks
  if not exists (select 1 from renum where old like 'C%') then raise exception 'No C flats found: already renumbered? Nothing changed.'; end if;
  select string_agg(id, ', ') into bad from public.flats
   where (id like 'B%' and (id !~ '^B[0-9]{3,4}$' or right(id, 2)::int not between 1 and 4))
      or (id like 'C%' and (id !~ '^C[0-9]{3,4}$' or right(id, 2)::int <> 1));
  if bad is not null then raise exception 'Unexpected flat numbers, nothing changed: %', bad; end if;
  select string_agg(coalesce(u.email, u.id::text) || ' (' || (u.raw_app_meta_data ->> 'flat_id') || ')', ', ') into bad
    from auth.users u where u.raw_app_meta_data ->> 'flat_id' in (select old from renum);
  if bad is not null then raise exception 'These logins are linked to B / C flats; remove or unlink them first, nothing changed: %', bad; end if;

  -- 3. Every column that stores a flat number: foreign keys to flats, plus the known flat columns
  create temp table renum_cols (tab text, col text) on commit drop;
  for c in
    select distinct cl.relname as tab, a.attname as col
      from pg_constraint k join pg_class cl on cl.oid = k.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
     where k.contype = 'f' and k.confrelid = 'public.flats'::regclass and ns.nspname = 'public'
    union
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type = 'text' and table_name <> 'flats'
       and column_name in ('flat_id', 'holder_flat', 'backup_flat', 'owner_flat', 'cash_to', 'assigned_flat')
       and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
  loop
    insert into renum_cols values (c.tab, c.col);
  end loop;

  -- 4. Switch off the app's own UPDATE triggers (flat rules, nominee status …) only while moving rows
  select coalesce(array_agg(distinct cl.relname::text), '{}') into tabs
    from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname = 'public' and not tg.tgisinternal and (tg.tgtype & 16) <> 0
     and (cl.relname = 'flats' or cl.relname in (select tab from renum_cols));
  foreach t in array tabs loop execute format('alter table public.%I disable trigger user', t); end loop;
  has_code := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flats' and column_name = 'edit_code');

  for m in select * from renum order by ord, old loop
    -- new flat row: a copy of the old one with the new number (edit_code kept back until the old row is gone)
    insert into public.flats
      select (jsonb_populate_record(null::public.flats,
                to_jsonb(f) || jsonb_build_object('id', m.new, 'flat_no', m.flat_no)
                            || case when to_jsonb(f) ? 'edit_code' then jsonb_build_object('edit_code', null) else '{}'::jsonb end
                            || case when m.old like 'C%' then jsonb_build_object('bhk', '4BHK') else '{}'::jsonb end)).*
        from public.flats f where f.id = m.old;
    for c in select * from renum_cols loop
      execute format('update public.%I set %I = $1 where %I = $2', c.tab, c.col, c.col) using m.new, m.old;
    end loop;
    if has_code then execute 'select edit_code::text from public.flats where id = $1' into code using m.old; end if;
    delete from public.flats where id = m.old;
    if has_code and code is not null then execute 'update public.flats set edit_code = $2 where id = $1' using m.new, code; end if;
    n := n + 1;
  end loop;

  foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
  raise notice 'Renumbered % flats.', n;
end $$;

-- Check: C flats 0; B flats as positions 01 and 03–06 only; the joined homes show B-x01/x02
select 'C flats left' as item, count(*)::text as value from public.flats where id like 'C%'
union all select 'B 2 BHK (positions 03–06)', count(*)::text from public.flats where id ~ '^B[0-9]+0[3-6]$'
union all select 'B 4 BHK joined (B?01, Tower C)', count(*)::text from public.flats where id ~ '^B[0-9]+01$' and flat_no like '%/%'
union all select 'B at positions 02 (should be 0)', count(*)::text from public.flats where id ~ '^B[0-9]+02$'
union all select 'all flats', count(*)::text from public.flats;
