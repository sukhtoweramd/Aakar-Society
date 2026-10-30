-- Separate login for the tenant of a rented flat (30 Oct 2026). Run once in Supabase → SQL Editor. Safe to re-run.
-- Run AFTER the app update is live, and after AREAS_BACKUPS.sql. Then run sql-security/09_RESTORE_tenant_logins.sql.
--
-- How it works
--   • The flat login stays the OWNER's (role "resident", app_metadata.flat_id). A tenant login is role "tenant" with
--     app_metadata.tenant_flat (NOT flat_id), so every existing flat rule (my_flat()) ignores it: by default a tenant
--     can read nothing of the flat. This script then opens exactly what the tenant may use.
--   • flat_tenant_logins: one row per tenant login (written only by the server, from ADMIN / the flat page).
--     A tenant login works only while its row is ACTIVE and the flat is still marked rented (occupancy = tenant).
--     TENANT MOVED OUT (occupancy back to owner) switches it off at once (trigger below); the committee can also revoke.
--     Revoking never deletes family, vehicles, complaints or bookings.
--   • Tenant may: own flat's family members, vehicles, emergency contacts (add / edit; head of family fill-once as for
--     flats); raise and see own flat's complaints; book the common plot and cancel own bookings; read notices,
--     events, contacts and Who to contact (already open to every login).
--     Tenant may NOT: bills, receipts, ledger, "I have paid", nominees, letters / letter requests, flat documents,
--     the flat row itself (owner details), committee or admin screens.
--   • Owner of a rented flat that HAS an active tenant login: can still see, but no longer add / change / remove the
--     family, vehicles and emergency contacts (they are the tenant's). Without a tenant login nothing changes.
-- Undo: TENANT_LOGINS_UNDO.sql.

-- 1. Tenant logins
create table if not exists public.flat_tenant_logins (
  user_id       uuid primary key,                         -- auth.users id of the tenant login
  flat_id       text not null references public.flats(id) on update cascade,
  tenant_name   text,
  active        boolean not null default true,
  created_by    text, created_at timestamptz not null default now(),
  revoked_at    timestamptz, revoked_by text, revoke_reason text
);
create unique index if not exists flat_tenant_logins_one_active on public.flat_tenant_logins(flat_id) where active;
alter table public.flat_tenant_logins enable row level security;
drop policy if exists committee_read on public.flat_tenant_logins;
create policy committee_read on public.flat_tenant_logins for select to authenticated using (public.is_committee());
-- no insert / update / delete rule: only the server (secret key) and the trigger below write here
revoke all on public.flat_tenant_logins from anon;
grant select, insert, update, delete on public.flat_tenant_logins to authenticated, service_role;

-- 2. Who is a tenant, of which flat
create or replace function public.my_tenant_flat() returns text
language sql stable security definer set search_path = public as $$
  select t.flat_id from public.flat_tenant_logins t join public.flats f on f.id = t.flat_id
   where t.user_id = auth.uid() and t.active and f.occupancy = 'tenant'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'tenant'
     and exists (select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data ->> 'role' = 'tenant')
   limit 1
$$;
create or replace function public.my_home_flat() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_flat(), public.my_tenant_flat())
$$;
create or replace function public.flat_has_tenant_login(p_flat text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.flat_tenant_logins t join public.flats f on f.id = t.flat_id
                  where t.flat_id = p_flat and t.active and f.occupancy = 'tenant')
$$;
revoke all on function public.my_tenant_flat() from public, anon;
revoke all on function public.my_home_flat() from public, anon;
revoke all on function public.flat_has_tenant_login(text) from public, anon;
grant execute on function public.my_tenant_flat() to authenticated, service_role;
grant execute on function public.my_home_flat() to authenticated, service_role;
grant execute on function public.flat_has_tenant_login(text) to authenticated, service_role;

-- 3. Moved out → tenant login off (immediately; the server also blocks the login itself when it can)
create or replace function public.tenant_moved_out() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.occupancy = 'tenant' and new.occupancy is distinct from 'tenant' then
    update public.flat_tenant_logins set active = false, revoked_at = now(),
           revoked_by = coalesce(auth.jwt() ->> 'email', 'system'), revoke_reason = 'tenant moved out'
     where flat_id = new.id and active;
  end if;
  return new;
end $$;
revoke all on function public.tenant_moved_out() from public, anon, authenticated;
drop trigger if exists tenant_moved_out on public.flats;
create trigger tenant_moved_out after update of occupancy on public.flats for each row execute function public.tenant_moved_out();

-- 4. Family, vehicles, emergency contacts: owner reads; owner changes only while no tenant login; tenant manages own flat
drop policy if exists resident_members_own on public.members;
drop policy if exists resident_read on public.members;
drop policy if exists resident_add on public.members;
drop policy if exists resident_change on public.members;
drop policy if exists resident_remove on public.members;
drop policy if exists tenant_own on public.members;
create policy resident_read   on public.members for select to authenticated using (flat_id = public.my_flat());
create policy resident_add    on public.members for insert to authenticated with check (flat_id = public.my_flat() and not public.flat_has_tenant_login(flat_id));
create policy resident_change on public.members for update to authenticated using (flat_id = public.my_flat() and not public.flat_has_tenant_login(flat_id)) with check (flat_id = public.my_flat());
create policy resident_remove on public.members for delete to authenticated using (flat_id = public.my_flat() and not public.flat_has_tenant_login(flat_id));
create policy tenant_own      on public.members for all to authenticated using (flat_id = public.my_tenant_flat()) with check (flat_id = public.my_tenant_flat());

do $$ declare t text; begin
  foreach t in array array['vehicles', 'emergency_contacts'] loop
    execute format('drop policy if exists resident_own on public.%I', t);
    execute format('drop policy if exists resident_read on public.%I', t);
    execute format('drop policy if exists resident_add on public.%I', t);
    execute format('drop policy if exists resident_change on public.%I', t);
    execute format('drop policy if exists resident_remove on public.%I', t);
    execute format('drop policy if exists tenant_own on public.%I', t);
    execute format('create policy resident_read on public.%I for select to authenticated using (flat_id = public.my_flat())', t);
    execute format('create policy resident_add on public.%I for insert to authenticated with check (flat_id = public.my_flat() and not public.flat_has_tenant_login(flat_id))', t);
    execute format('create policy resident_change on public.%I for update to authenticated using (flat_id = public.my_flat() and not public.flat_has_tenant_login(flat_id)) with check (flat_id = public.my_flat())', t);
    execute format('create policy resident_remove on public.%I for delete to authenticated using (flat_id = public.my_flat() and not public.flat_has_tenant_login(flat_id))', t);
    execute format('create policy tenant_own on public.%I for all to authenticated using (flat_id = public.my_tenant_flat()) with check (flat_id = public.my_tenant_flat())', t);
  end loop;
end $$;

-- head of family stays "fill once" for tenant logins too (same as sql-security/06, with my_home_flat)
create or replace function public.members_head_guard() returns trigger
language plpgsql as $$
declare
  fid text;
begin
  -- only flat and tenant logins are limited (committee logins and the server are not)
  if public.is_committee() or public.my_home_flat() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if coalesce(old.is_head, false) and nullif(trim(coalesce(old.name, '')), '') is not null then
      raise exception 'The head of family can be removed only by the committee.';
    end if;
    return old;
  end if;
  fid := new.flat_id;
  if tg_op = 'UPDATE' and coalesce(old.is_head, false) and nullif(trim(coalesce(old.name, '')), '') is not null then
    if new.name is distinct from old.name then
      raise exception 'The head of family''s name is already filled in. Only the committee can change it.';
    end if;
    if not coalesce(new.is_head, false) then
      raise exception 'Only the committee can change who is the head of family.';
    end if;
  end if;
  if coalesce(new.is_head, false) and (tg_op = 'INSERT' or not coalesce(old.is_head, false))
     and exists (select 1 from public.members m
                  where m.flat_id = fid and coalesce(m.is_head, false) and m.id is distinct from new.id
                    and nullif(trim(coalesce(m.name, '')), '') is not null) then
    raise exception 'This flat already has a head of family. Only the committee can change it.';
  end if;
  return new;
end $$;

-- 5. Complaints: the tenant raises and follows the flat's complaints
drop policy if exists tenant_read on public.complaints;
drop policy if exists tenant_raise on public.complaints;
create policy tenant_read  on public.complaints for select to authenticated using (flat_id = public.my_tenant_flat());
create policy tenant_raise on public.complaints for insert to authenticated with check (flat_id = public.my_tenant_flat());

-- 6. Common plot bookings: the tenant books for the flat and cancels its own (same rules as the flat login)
drop policy if exists tenant_read on public.bookings;
create policy tenant_read on public.bookings for select to authenticated using (flat_id = public.my_tenant_flat());

create or replace function public.request_booking(p_flat text, p_areas uuid[], p_date date, p_slot text, p_purpose text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid(); aid uuid; a public.booking_areas; who text := coalesce(auth.jwt() ->> 'email', public.my_home_flat(), 'unknown');
begin
  if not (public.is_committee() or (public.my_home_flat() is not null and public.my_home_flat() = p_flat)) then raise exception 'You can book only for your own flat.'; end if;
  if p_slot not in ('morning', 'evening') then raise exception 'Choose morning or evening.'; end if;
  if p_areas is null or array_length(p_areas, 1) is null then raise exception 'Choose at least one area.'; end if;
  if not public.is_committee() and (p_date <= public.booking_today() or p_date > public.booking_today() + 90) then
    raise exception 'Bookings can be made from tomorrow up to 90 days ahead.';
  end if;
  foreach aid in array p_areas loop
    select * into a from public.booking_areas where id = aid and active;
    if not found then raise exception 'Area not available.'; end if;
    begin
      insert into public.bookings (group_id, flat_id, area_id, area_name, book_date, slot, purpose, created_by)
      values (g, p_flat, a.id, a.name, p_date, p_slot, nullif(trim(coalesce(p_purpose, '')), ''), who);
    exception when unique_violation then
      raise exception '% is already booked or requested on % (%). Please choose another date or slot.', a.name, to_char(p_date, 'DD Mon YYYY'), p_slot;
    end;
  end loop;
  return g;
end $$;

create or replace function public.cancel_booking(p_group uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings; who text := coalesce(auth.jwt() ->> 'email', public.my_home_flat(), 'unknown'); boss boolean := public.is_committee() or public.can_approve_booking();
begin
  select * into b from public.bookings where group_id = p_group and status in ('pending', 'approved') limit 1;
  if not found then raise exception 'Nothing to cancel.'; end if;
  if not boss then
    if public.my_home_flat() is distinct from b.flat_id then raise exception 'You can cancel only your own booking.'; end if;
    if b.book_date <= public.booking_today() then raise exception 'Bookings can be cancelled by the member only until the day before. Please contact the committee.'; end if;
  end if;
  update public.bookings set status = 'cancelled', reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = who, decided_at = now(), updated_at = now()
   where group_id = p_group and status in ('pending', 'approved');
  if b.notice_id is not null then
    update public.notices set title = 'CANCELLED – ' || title, content = 'This booking has been cancelled; the area is free.' || E'\n\n' || coalesce(content, ''), is_banner = false
     where id::text = b.notice_id and title not like 'CANCELLED%';
  end if;
end $$;
revoke all on function public.request_booking(text, uuid[], date, text, text), public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.request_booking(text, uuid[], date, text, text), public.cancel_booking(uuid, text) to authenticated;

-- Check (expected): table 1 • rules on table 1 • moved-out trigger on true • members rules 6 • vehicles rules 6 •
--                   emergency rules 6 • complaints tenant rules 2 • booking tenant rule 1 • head guard uses my_home_flat true •
--                   tenant logins active 0
select 'table' as item, count(*)::text as value from information_schema.tables where table_schema = 'public' and table_name = 'flat_tenant_logins'
union all select 'rules on table', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'flat_tenant_logins'
union all select 'moved-out trigger on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'tenant_moved_out' and not tgisinternal)::text
union all select 'members rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'members'
union all select 'vehicles rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'vehicles'
union all select 'emergency rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'emergency_contacts'
union all select 'complaints tenant rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'complaints' and policyname like 'tenant_%'
union all select 'booking tenant rule', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'bookings' and policyname = 'tenant_read'
union all select 'head guard uses my_home_flat', (pg_get_functiondef('public.members_head_guard()'::regprocedure) like '%my_home_flat%')::text
union all select 'tenant logins active', count(*)::text from public.flat_tenant_logins where active;
