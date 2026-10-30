-- UNDO of SPLIT_B101_B102.sql: joins B101 and B102 back into one home "B101/102" (4 BHK, Tower C).
-- Stops WITHOUT CHANGING ANYTHING if B102 already holds any data (owner, family, bills, documents, login …)
-- or B101 / B102 are not as the split left them. Maintenance and area are copied from B201 (same category).

do $$
declare
  f public.flats%rowtype; j jsonb; bad text := ''; c record; n bigint; k text;
begin
  select * into f from public.flats where id = 'B102';
  if not found then raise notice 'No flat B102: nothing to undo.'; return; end if;
  if not exists (select 1 from public.flats where id = 'B101' and flat_no = 'B101') then raise exception 'B101 is not the separate flat "B101". Nothing changed.'; end if;

  j := to_jsonb(f);
  foreach k in array array['owner_name', 'tenant_name', 'email', 'owner_mobile', 'owner_address', 'share_cert_no', 'member_since', 'r2_url', 'committee_role'] loop
    if j ? k and nullif(trim(coalesce(j ->> k, '')), '') is not null then bad := bad || k || ', '; end if;
  end loop;
  if coalesce((j ->> 'is_committee')::boolean, false) then bad := bad || 'is_committee, '; end if;
  for c in
    select distinct cl.relname as tab, a.attname as col
      from pg_constraint kk join pg_class cl on cl.oid = kk.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = kk.conrelid and a.attnum = any (kk.conkey)
     where kk.contype = 'f' and kk.confrelid = 'public.flats'::regclass and ns.nspname = 'public'
    union
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type = 'text' and table_name <> 'flats'
       and column_name in ('flat_id', 'holder_flat', 'backup_flat', 'owner_flat', 'cash_to', 'assigned_flat')
       and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
  loop
    execute format('select count(*) from public.%I where %I = $1', c.tab, c.col) into n using 'B102';
    if n > 0 then bad := bad || c.tab || '.' || c.col || ' (' || n || ' rows), '; end if;
  end loop;
  if exists (select 1 from auth.users u where u.raw_app_meta_data ->> 'flat_id' = 'B102') then bad := bad || 'a login is linked to B102, '; end if;
  if bad <> '' then raise exception 'B102 is not empty, nothing changed: %', left(bad, length(bad) - 2); end if;

  alter table public.flats disable trigger flats_resident_guard;
  delete from public.flats where id = 'B102';
  update public.flats b set flat_no = 'B101/102', bhk = coalesce(s.bhk, '4BHK'), maintenance = s.maintenance
    from (select bhk, maintenance from public.flats where id = 'B201') s where b.id = 'B101';
  if j ? 'sqft' then execute 'update public.flats set sqft = (select sqft from public.flats where id = ''B201'') where id = ''B101'''; end if;
  alter table public.flats enable trigger flats_resident_guard;
  raise notice 'Undone: B101 is the joined home "B101/102" again.';
end $$;

-- Check (expected): B102 rows 0 • B101 flat_no B101/102 • Tower C flats 10 • all flats 90 • flat rules on true
select 'B102 rows' as item, count(*)::text as value from public.flats where id = 'B102'
union all select 'B101 flat_no', coalesce((select flat_no from public.flats where id = 'B101'), '-')
union all select 'Tower C flats', count(*)::text from public.flats where tower = 'C'
union all select 'all flats', count(*)::text from public.flats
union all select 'flat rules on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'flats_resident_guard' and not tgisinternal)::text;
