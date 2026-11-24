-- Undo of MT_07_FLAT_KEYS.sql: flats keyed by id alone again, links to flats over the flat column alone, towers keyed by code, nomination_status by flat_id.
-- Only works while no two societies share a flat id / tower code (with one society, as today, that is always true).
-- If it stops with "could not create unique index" or "violates", a second society already reuses ids: leave MT_07 in place.
-- Also puts back flats_tower_check (towers A, B, C only), which fails if a flat of another tower exists.
do $$
declare
  fk record;
  pk text;
  newdef text;
  def text;
begin
  -- the links to flats (the ones that include the society)
  create temp table mt07_undo_fks on commit drop as
    select con.conname::text as conname, con.conrelid::regclass::text as tbl, pg_get_constraintdef(con.oid) as def
      from pg_constraint con where con.confrelid = 'public.flats'::regclass and con.contype = 'f' and array_length(con.conkey, 1) = 2;
  for fk in select * from mt07_undo_fks loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
  end loop;
  select con.conname into pk from pg_constraint con where con.conrelid = 'public.flats'::regclass and con.contype = 'p';
  if pk is not null then execute format('alter table public.flats drop constraint %I', pk); end if;
  alter table public.flats add constraint flats_pkey primary key (id);
  for fk in select * from mt07_undo_fks loop
    newdef := regexp_replace(fk.def, 'FOREIGN KEY \(society_id, ([^)]*)\)', 'FOREIGN KEY (\1)');
    newdef := regexp_replace(newdef, 'REFERENCES (public\.)?flats\(society_id, id\)', 'REFERENCES public.flats(id)');
    newdef := regexp_replace(newdef, 'SET (NULL|DEFAULT) \([^)]*\)', 'SET \1');
    execute format('alter table %s add constraint %I %s', fk.tbl, fk.conname, newdef);
  end loop;

  if to_regclass('public.towers') is not null then
    select con.conname into pk from pg_constraint con where con.conrelid = 'public.towers'::regclass and con.contype = 'p';
    if pk is not null then execute format('alter table public.towers drop constraint %I', pk); end if;
    alter table public.towers add constraint towers_pkey primary key (code);
  end if;
  if to_regclass('public.nomination_status') is not null then
    select con.conname into pk from pg_constraint con where con.conrelid = 'public.nomination_status'::regclass and con.contype = 'p';
    if pk is not null then execute format('alter table public.nomination_status drop constraint %I', pk); end if;
    alter table public.nomination_status add constraint nomination_status_pkey primary key (flat_id);
  end if;

  if to_regprocedure('public.towers_guard()') is not null then
    def := pg_get_functiondef('public.towers_guard()'::regprocedure);
    execute replace(def, 'where f.society_id = old.society_id and trim(f.tower) = old.code', 'where trim(f.tower) = old.code');
  end if;
  if to_regprocedure('public.nominees_changed()') is not null then
    def := pg_get_functiondef('public.nominees_changed()'::regprocedure);
    newdef := replace(def, 'insert into public.nomination_status (society_id, flat_id,', 'insert into public.nomination_status (flat_id,');
    newdef := replace(newdef, 'values (coalesce(new.society_id, old.society_id), fid,', 'values (fid,');
    newdef := replace(newdef, 'on conflict (society_id, flat_id)', 'on conflict (flat_id)');
    execute newdef;
  end if;
end $$;

do $$
begin
  if to_regclass('public.flats') is not null and not exists (select 1 from pg_constraint where conname = 'flats_tower_check') then
    alter table public.flats add constraint flats_tower_check check (tower = any (array['A','B','C']));
  end if;
end $$;

select 'links to flats that still include the society (expect 0)' as what, count(*)::text as value
from pg_constraint con where con.confrelid = 'public.flats'::regclass and con.contype = 'f' and array_length(con.conkey, 1) = 2;
