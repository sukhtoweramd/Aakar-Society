-- 15 · Which flats hold no data? (ADMIN → FLAT SETUP → remove flats)   (19 Nov 2026)
-- Adds ONE read-only function, public.flat_blockers(text[]): for each flat id it returns what still holds data (empty text = the flat is
-- empty and may be removed). It changes no data. The app's server (service key only) calls it before it removes any flat, and
-- refuses when anything is listed. A flat counts as NOT empty when it has:
--   • an owner / tenant name, email, mobile, address, share certificate, member-since date, documents link, committee role / person / flag,
--     a rented occupancy, or a status of filled / occupied / sold / approved
--   • a row in ANY table that points at it (foreign keys to flats + every text column named flat_id, holder_flat, backup_flat,
--     owner_flat, cash_to, assigned_flat) — family, vehicles, bills, receipts, letters, bookings, complaints, nominees, events …
--   • the flat in the backup list of an area of responsibility (committee_areas.backup_flats)
--   • a login linked to it (flat login flat_id, tenant login tenant_flat)
-- Maintenance, BHK and area are structure, not data: they do not block.
-- Safe to re-run. Undo: 15_UNDO.sql. Run in Supabase > SQL Editor.

create or replace function public.flat_blockers(p_flats text[])
returns table (flat_id text, blockers text)
language plpgsql stable security definer set search_path = public as $$
declare
  fid text; f public.flats%rowtype; j jsonb; bad text; c record; n bigint; k text;
begin
  foreach fid in array coalesce(p_flats, array[]::text[]) loop
    bad := '';
    select * into f from public.flats x where x.id = fid;
    if not found then
      flat_id := fid; blockers := 'no such flat'; return next; continue;
    end if;
    j := to_jsonb(f);
    foreach k in array array['owner_name', 'tenant_name', 'email', 'owner_mobile', 'owner_address', 'share_cert_no', 'member_since',
                             'r2_url', 'committee_role', 'committee_person', 'tenant_from', 'agreement_until'] loop
      if j ? k and nullif(trim(coalesce(j ->> k, '')), '') is not null then bad := bad || k || ', '; end if;
    end loop;
    if coalesce((j ->> 'is_committee')::boolean, false) then bad := bad || 'is_committee, '; end if;
    if j ? 'committee_members' and jsonb_array_length(coalesce(j -> 'committee_members', '[]'::jsonb)) > 0 then bad := bad || 'committee_members, '; end if;
    if coalesce(j ->> 'occupancy', 'owner') <> 'owner' then bad := bad || 'occupancy, '; end if;
    if lower(coalesce(j ->> 'status', '')) in ('filled', 'occupied', 'sold', 'approved') then bad := bad || 'status, '; end if;

    for c in
      select distinct cl.relname as tab, a.attname as col
        from pg_constraint kk join pg_class cl on cl.oid = kk.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = kk.conrelid and a.attnum = any (kk.conkey)
       where kk.contype = 'f' and kk.confrelid = 'public.flats'::regclass and ns.nspname = 'public'
      union
      select table_name, column_name from information_schema.columns
       where table_schema = 'public' and data_type in ('text', 'character varying') and table_name <> 'flats'
         and column_name in ('flat_id', 'holder_flat', 'backup_flat', 'owner_flat', 'cash_to', 'assigned_flat')
         and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
    loop
      execute format('select count(*) from public.%I where %I = $1', c.tab, c.col) into n using fid;
      if n > 0 then bad := bad || c.tab || '.' || c.col || ' (' || n || '), '; end if;
    end loop;

    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'committee_areas' and column_name = 'backup_flats') then
      execute 'select count(*) from public.committee_areas where $1 = any (backup_flats)' into n using fid;
      if n > 0 then bad := bad || 'committee_areas.backup_flats (' || n || '), '; end if;
    end if;

    if exists (select 1 from auth.users u where u.raw_app_meta_data ->> 'flat_id' = fid or u.raw_app_meta_data ->> 'tenant_flat' = fid) then
      bad := bad || 'a login is linked, ';
    end if;

    flat_id := fid; blockers := case when bad = '' then '' else left(bad, length(bad) - 2) end; return next;
  end loop;
end $$;

-- only the server's own key may call it (members and anonymous visitors may not see which flats hold data)
revoke all on function public.flat_blockers(text[]) from public, anon, authenticated;
grant execute on function public.flat_blockers(text[]) to service_role;

-- Check (expected): function exists • closed to anon and members • open to the server key • a flat with data is listed (read-only test)
select 'function exists' as item, (to_regprocedure('public.flat_blockers(text[])') is not null)::text as value
union all select 'closed to anon', (not has_function_privilege('anon', 'public.flat_blockers(text[])', 'execute'))::text
union all select 'closed to members', (not has_function_privilege('authenticated', 'public.flat_blockers(text[])', 'execute'))::text
union all select 'open to the server key', has_function_privilege('service_role', 'public.flat_blockers(text[])', 'execute')::text
union all select 'flats with data (of all flats, today)', (select count(*) filter (where blockers <> '')::text || ' of ' || count(*)::text
                                                          from public.flat_blockers((select array_agg(id) from public.flats)));
