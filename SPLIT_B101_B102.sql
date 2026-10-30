-- B101 and B102 become two separate flats (decided 30 Oct 2026). ONE-TIME script, safe to re-run.
--   Today: one joined 4 BHK home, id B101, flat_no "B101/102", listed under Tower C.
--   After: B101 and B102, each its own flat (own owner, family, documents, login and maintenance bill), both Tower C, floor 1.
--   Every other joined home (B201/202 … B1001/1002) stays as it is. Tower C goes from 10 to 11 flats; the society from 90 to 91.
--
-- BEFORE: ADMIN → BACKUP & RESTORE → DOWNLOAD FULL BACKUP.
-- Run in Supabase → SQL Editor. Needs RENUMBER_B_C.sql to have been run (it was, 28 Oct 2026).
--
-- The script checks first and stops WITHOUT CHANGING ANYTHING if:
--   • B101 is not the joined home "B101/102" (and the split is not already done)
--   • B101 holds any member data: owner / tenant name, email, mobiles, share certificate, committee flag, documents,
--     or ANY row in another table (family, vehicles, bills, receipts, letters, bookings, complaints, nominees, events …)
--   • a login (flat or committee) is linked to B101
--   Agreed 30 Oct 2026: the app has no data for B101 / B102, so nothing has to be moved.
--
-- Maintenance, BHK and area of B101 and B102 are left EMPTY on purpose: the joined home's rate must not be charged
-- twice. Set them in ADMIN → charges ("TOWER C FLOOR 1 • SEPARATE FLATS") and APPLY TO FLATS. Until then the
-- billing screen shows "no maintenance set" for both flats and does not bill them.
-- Undo: SPLIT_B101_B102_UNDO.sql.

do $$
declare
  f public.flats%rowtype; j jsonb; bad text := ''; c record; n bigint; k text;
begin
  select * into f from public.flats where id = 'B101';
  if not found then raise exception 'Flat B101 not found: run RENUMBER_B_C.sql first. Nothing changed.'; end if;

  -- already done?
  if coalesce(f.flat_no, '') = 'B101' and exists (select 1 from public.flats where id = 'B102') then
    raise notice 'B101 and B102 are already separate flats. Nothing changed.';
    return;
  end if;
  if coalesce(f.flat_no, '') <> 'B101/102' then raise exception 'B101 is "%", expected the joined home "B101/102". Nothing changed.', f.flat_no; end if;
  if exists (select 1 from public.flats where id = 'B102') then raise exception 'A flat B102 already exists. Nothing changed.'; end if;

  -- 1. B101 itself must be empty (only columns that exist in this database are checked)
  j := to_jsonb(f);
  foreach k in array array['owner_name', 'tenant_name', 'email', 'owner_mobile', 'owner_address', 'share_cert_no', 'member_since',
                           'r2_url', 'committee_role', 'committee_person', 'tenant_from', 'agreement_until'] loop
    if j ? k and nullif(trim(coalesce(j ->> k, '')), '') is not null then bad := bad || k || ', '; end if;
  end loop;
  if coalesce((j ->> 'is_committee')::boolean, false) then bad := bad || 'is_committee, '; end if;
  if j ? 'committee_members' and jsonb_array_length(coalesce(j -> 'committee_members', '[]'::jsonb)) > 0 then bad := bad || 'committee_members, '; end if;
  if coalesce(j ->> 'occupancy', 'owner') <> 'owner' then bad := bad || 'occupancy, '; end if;

  -- 2. No row anywhere else may point at B101 (foreign keys to flats + the known flat columns)
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
    execute format('select count(*) from public.%I where %I = $1', c.tab, c.col) into n using 'B101';
    if n > 0 then bad := bad || c.tab || '.' || c.col || ' (' || n || ' rows), '; end if;
  end loop;

  -- 3. No login linked to B101
  if exists (select 1 from auth.users u where u.raw_app_meta_data ->> 'flat_id' = 'B101') then bad := bad || 'a login is linked to B101, '; end if;

  if bad <> '' then raise exception 'B101 is not empty, nothing changed: %', left(bad, length(bad) - 2); end if;

  -- 4. Split. The flat rules trigger is paused for these two rows only (the SQL Editor has no committee login).
  alter table public.flats disable trigger flats_resident_guard;
  update public.flats set flat_no = 'B101', bhk = null, maintenance = null where id = 'B101';
  if j ? 'sqft' then execute 'update public.flats set sqft = null where id = $1' using 'B101'; end if;
  insert into public.flats (id, tower, floor, flat_no, status) values ('B102', f.tower, f.floor, 'B102', f.status);
  alter table public.flats enable trigger flats_resident_guard;
  raise notice 'Done: B101 and B102 are separate flats. Set their maintenance in ADMIN → charges.';
end $$;

-- Check (expected): B101 flat_no B101 • B102 flat_no B102 • both tower C floor 1, maintenance empty •
--                   Tower C flats 11 • joined homes 9 • all flats 91 • flat rules on true
select 'B101' as item, coalesce(flat_no, '-') || ' • tower ' || coalesce(tower, '-') || ' • floor ' || coalesce(floor::text, '-') || ' • maint ' || coalesce(maintenance::text, 'empty') as value from public.flats where id = 'B101'
union all select 'B102', coalesce(flat_no, '-') || ' • tower ' || coalesce(tower, '-') || ' • floor ' || coalesce(floor::text, '-') || ' • maint ' || coalesce(maintenance::text, 'empty') from public.flats where id = 'B102'
union all select 'Tower C flats', count(*)::text from public.flats where tower = 'C'
union all select 'joined homes (x01/x02)', count(*)::text from public.flats where flat_no like '%/%'
union all select 'all flats', count(*)::text from public.flats
union all select 'flat rules on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'flats_resident_guard' and not tgisinternal)::text;
