-- UNDO of TENANT_LOGINS.sql: back to one login per flat. Tenant logins stop working (their role is no longer used).
-- Family, vehicles, emergency contacts, complaints and bookings are NOT changed. Safe to re-run.

drop trigger if exists tenant_moved_out on public.flats;
drop function if exists public.tenant_moved_out();

-- family, vehicles, emergency contacts: the flat login manages its own rows again (as in RESIDENT_ACCESS.sql / PRE_PHASE2_A.sql)
drop policy if exists resident_read on public.members;
drop policy if exists resident_add on public.members;
drop policy if exists resident_change on public.members;
drop policy if exists resident_remove on public.members;
drop policy if exists tenant_own on public.members;
drop policy if exists resident_members_own on public.members;
create policy resident_members_own on public.members for all to authenticated using (flat_id = public.my_flat()) with check (flat_id = public.my_flat());
do $$ declare t text; begin
  foreach t in array array['vehicles', 'emergency_contacts'] loop
    execute format('drop policy if exists resident_read on public.%I', t);
    execute format('drop policy if exists resident_add on public.%I', t);
    execute format('drop policy if exists resident_change on public.%I', t);
    execute format('drop policy if exists resident_remove on public.%I', t);
    execute format('drop policy if exists tenant_own on public.%I', t);
    execute format('drop policy if exists resident_own on public.%I', t);
    execute format('create policy resident_own on public.%I for all to authenticated using (flat_id = public.my_flat()) with check (flat_id = public.my_flat())', t);
  end loop;
end $$;

-- head of family guard exactly as sql-security/06
create or replace function public.members_head_guard() returns trigger
language plpgsql as $$
declare
  fid text;
begin
  -- only flat logins are limited (committee logins and the server are not)
  if public.is_committee() or public.my_flat() is null then
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

drop policy if exists tenant_read on public.complaints;
drop policy if exists tenant_raise on public.complaints;
drop policy if exists tenant_read on public.bookings;

-- booking functions exactly as BOOKINGS.sql
create or replace function public.request_booking(p_flat text, p_areas uuid[], p_date date, p_slot text, p_purpose text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid(); aid uuid; a public.booking_areas; who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'unknown');
begin
  if not (public.is_committee() or (public.my_flat() is not null and public.my_flat() = p_flat)) then raise exception 'You can book only for your own flat.'; end if;
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
declare b public.bookings; who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'unknown'); boss boolean := public.is_committee() or public.can_approve_booking();
begin
  select * into b from public.bookings where group_id = p_group and status in ('pending', 'approved') limit 1;
  if not found then raise exception 'Nothing to cancel.'; end if;
  if not boss then
    if public.my_flat() is distinct from b.flat_id then raise exception 'You can cancel only your own booking.'; end if;
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

drop function if exists public.flat_has_tenant_login(text);
drop function if exists public.my_home_flat();
drop function if exists public.my_tenant_flat();
drop table if exists public.flat_tenant_logins;

-- Check (expected): table gone true • tenant rules 0 • members own rule 1
select 'table gone' as item, (to_regclass('public.flat_tenant_logins') is null)::text as value
union all select 'tenant rules', count(*)::text from pg_policies where schemaname = 'public' and policyname like 'tenant_%'
union all select 'members own rule', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'members' and policyname = 'resident_members_own';
