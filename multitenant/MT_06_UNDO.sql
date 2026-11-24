-- Undo of MT_06_SETTINGS_PER_SOCIETY.sql: the functions say "where id = 1" again and the five settings tables are keyed by id alone.
-- Only works while there is ONE row per settings table (one society, as today). With a second society's rows it stops at the key step; leave MT_06 in place then.
do $$
declare
  f record;
  def text;
  newdef text;
  t text;
  pk text;
begin
  for f in
    select p.oid, p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.prosrc like '%current_society_or_first()%' and p.proname <> 'current_society_or_first'
  loop
    def := pg_get_functiondef(f.oid);
    newdef := replace(def, 'where society_id = public.current_society_or_first() and id = 1', 'where id = 1');
    if newdef <> def then execute newdef; end if;
  end loop;

  foreach t in array array['billing_settings', 'app_settings', 'society_profile', 'help_guide', 'society_live'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    select con.conname into pk from pg_constraint con where con.conrelid = ('public.' || t)::regclass and con.contype = 'p';
    if pk is not null then execute format('alter table public.%I drop constraint %I', t, pk); end if;
    execute format('alter table public.%I add constraint %I primary key (id)', t, t || '_pkey');
  end loop;
end $$;

drop function if exists public.current_society_or_first();

select 'functions still using the society helper (expect 0)' as what, count(*)::text as value
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%current_society_or_first()%';
