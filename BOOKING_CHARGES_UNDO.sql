-- BOOKING_CHARGES_UNDO.sql · puts bookings back as before BOOKING_CHARGES.sql (morning / evening, no charge, no invoice).
-- Data is kept: the new columns stay (unused), booking invoices already raised stay, area charges stay stored.
-- Run in Supabase > SQL Editor. Safe to re-run.

drop trigger if exists booking_areas_charge_guard on public.booking_areas;
drop trigger if exists bookings_charge_guard on public.bookings;
drop function if exists public.booking_charge_guard();
drop function if exists public.set_booking_charge(uuid, numeric);
drop function if exists public.can_set_booking_charge();
drop index if exists public.bookings_day_taken;

-- bills / payments / "I have paid": owner only, as before (tenant booking invoices become visible to the committee only)
drop policy if exists tenant_own on public.bills;
drop policy if exists tenant_own on public.payments;
drop policy if exists tenant_read on public.payment_reports;
drop policy if exists tenant_add on public.payment_reports;
drop policy if exists tenant_withdraw on public.payment_reports;
drop policy if exists resident_own on public.bills;
create policy resident_own on public.bills for select to authenticated using (flat_id = public.my_flat());
drop policy if exists resident_own on public.payments;
create policy resident_own on public.payments for select to authenticated using (flat_id = public.my_flat());
drop policy if exists resident_read on public.payment_reports;
create policy resident_read on public.payment_reports for select to authenticated using (flat_id = public.my_flat());
drop policy if exists resident_add on public.payment_reports;
create policy resident_add on public.payment_reports for insert to authenticated
  with check (flat_id = public.my_flat() and status = 'pending' and payment_id is null and reviewed_by is null and verified_amount is null
              and (bill_id is null or exists (select 1 from public.bills b where b.id = bill_id and b.flat_id = public.my_flat())));
drop function if exists public.bill_is_tenant(uuid);

-- area names back
update public.booking_areas set name = 'TOWER-A', sort = 1 where name = 'Tower A area';
update public.booking_areas set name = 'TOWER-B', sort = 2 where name = 'Tower B area';
update public.booking_areas set name = 'COMMON', sort = 3 where name = 'Main common area';
update public.booking_areas set active = false where name = 'Center area';

-- functions back (request / cancel from TENANT_LOGINS.sql, approve from BOOKINGS.sql)
drop function if exists public.request_booking(text, uuid[], date, text, text, boolean);
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


create or replace function public.decide_booking(p_group uuid, p_approve boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare b public.bookings; areas text; n_areas int; all_active int; who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'unknown');
        slot_txt text; day_txt text; title text; body text; nid text;
begin
  if not public.can_approve_booking() then raise exception 'Only the Chairman or the Secretary can approve bookings.'; end if;
  select * into b from public.bookings where group_id = p_group and status = 'pending' limit 1;
  if not found then raise exception 'This request is not waiting for approval.'; end if;
  if not p_approve then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Write a reason for the member.'; end if;
    update public.bookings set status = 'rejected', reason = trim(p_reason), decided_by = who, decided_at = now(), updated_at = now()
     where group_id = p_group and status = 'pending';
    return null;
  end if;
  select string_agg(area_name, ', ' order by area_name), count(*) into areas, n_areas from public.bookings where group_id = p_group and status = 'pending';
  select count(*) into all_active from public.booking_areas where active;
  slot_txt := case b.slot when 'morning' then 'morning' else 'evening' end;
  day_txt := trim(to_char(b.book_date, 'Day')) || ', ' || to_char(b.book_date, 'DD Mon YYYY');
  if n_areas >= all_active then
    title := 'All areas booked: ' || to_char(b.book_date, 'DD Mon') || ' (' || slot_txt || ')';
    body := 'All common plot areas (' || areas || ') are booked by Flat ' || public.booking_flat_label(b.flat_id) || ' on ' || day_txt || ' (' || slot_txt || ').'
         || E'\n\nAll vehicles should be parked outside the premises during this time. Thank you for your co-operation.';
  else
    title := areas || ' booked: ' || to_char(b.book_date, 'DD Mon') || ' (' || slot_txt || ')';
    body := areas || ' is booked by Flat ' || public.booking_flat_label(b.flat_id) || ' on ' || day_txt || ' (' || slot_txt || ').'
         || E'\n\nPlease remove vehicles parked in ' || areas || ' before then. Thank you for your co-operation.';
  end if;
  insert into public.notices (title, content, tower, created_by, is_banner, banner_until)
  values (title, body, 'Common', who, true, b.book_date) returning id::text into nid;
  update public.bookings set status = 'approved', decided_by = who, decided_at = now(), notice_id = nid, updated_at = now()
   where group_id = p_group and status = 'pending';
  return nid;
end $$;


revoke all on function public.decide_booking(uuid, boolean, text) from public, anon;
grant execute on function public.decide_booking(uuid, boolean, text) to authenticated;

-- Check: areas back to 3 active; functions present
select 'active areas (expect 3)' as item, count(*)::text as value from public.booking_areas where active
union all select 'request_booking versions (expect 1)', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'request_booking'
union all select 'charge guards gone (expect 0)', count(*)::text from pg_trigger where tgname in ('booking_areas_charge_guard', 'bookings_charge_guard') and not tgisinternal;
