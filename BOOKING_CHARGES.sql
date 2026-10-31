-- BOOKING_CHARGES.sql · Common plot booking: four areas, full day only, a charge per area, invoice on approval
-- (Aakar, decided 30–31 Oct 2026; changes item 21 / BOOKINGS.sql).
--   • Areas: Tower A area, Center area (new), Tower B area, Main common area (TOWER-A, TOWER-B, COMMON are renamed;
--     old bookings keep the name they had).
--   • Full day only: new bookings are slot 'day'; an area is taken for the whole date. Old morning / evening
--     bookings stay as history.
--   • Charge per area per day, set by the Chairman, the Secretary or the main admin (logged in the access log).
--     The booking keeps the charge it was made with. No deposit.
--   • On approval (Chairman or Secretary) one invoice is raised in the OTHER BILL series, in the name of whoever
--     booked: the owner (flat login) or the tenant (tenant login). Society events: committee booking, no charge,
--     no invoice. ₹0 total: no invoice.
--   • Tenant invoices (bills.tenant_bill): seen by that tenant and the committee, not by the owner's login.
--   • Cancelling a booking cancels its invoice (no charge). A paid invoice: the committee refunds outside the app.
-- Needs: BOOKINGS.sql, BILLING.sql, LETTERS.sql, TENANT_LOGINS.sql, sql-security/05, AREAS_BACKUPS.sql (is_main_admin).
-- Run in Supabase > SQL Editor. Safe to re-run. Undo: BOOKING_CHARGES_UNDO.sql.

-- 1. Areas and their charge
alter table public.booking_areas add column if not exists charge numeric(12,2) not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'booking_areas_charge_check') then
    alter table public.booking_areas add constraint booking_areas_charge_check check (charge >= 0);
  end if;
end $$;
update public.booking_areas set name = 'Tower A area', sort = 1 where name = 'TOWER-A';
update public.booking_areas set name = 'Tower B area', sort = 3 where name = 'TOWER-B';
update public.booking_areas set name = 'Main common area', sort = 4 where name = 'COMMON';
insert into public.booking_areas (name, sort) values ('Center area', 2) on conflict (name) do nothing;

-- 2. Bookings: full day, charge, who booked, invoice
alter table public.bookings add column if not exists charge numeric(12,2) not null default 0;
alter table public.bookings add column if not exists booked_by text;          -- owner | tenant | committee
alter table public.bookings add column if not exists bill_name text;          -- the name the invoice goes to
alter table public.bookings add column if not exists free_event boolean not null default false;
alter table public.bookings add column if not exists bill_id uuid references public.bills(id) on delete set null;
alter table public.bookings drop constraint if exists bookings_slot_check;
alter table public.bookings add constraint bookings_slot_check check (slot in ('morning', 'evening', 'day'));

-- one full-day booking per area per date (the older index still keeps morning / evening history unique)
create unique index if not exists bookings_day_taken on public.bookings (area_id, book_date) where status in ('pending', 'approved') and slot = 'day';

-- 3. Bills raised to a tenant
alter table public.bills add column if not exists tenant_bill boolean not null default false;

create or replace function public.bill_is_tenant(p_bill uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select b.tenant_bill from public.bills b where b.id = p_bill), false)
$$;
revoke all on function public.bill_is_tenant(uuid) from public, anon;
grant execute on function public.bill_is_tenant(uuid) to authenticated, service_role;

-- owner (flat login): own flat, not the tenant's invoices; tenant: only the flat's tenant invoices
drop policy if exists resident_own on public.bills;
create policy resident_own on public.bills for select to authenticated using (flat_id = public.my_flat() and not tenant_bill);
drop policy if exists tenant_own on public.bills;
create policy tenant_own on public.bills for select to authenticated using (flat_id = public.my_tenant_flat() and tenant_bill);

drop policy if exists resident_own on public.payments;
create policy resident_own on public.payments for select to authenticated using (flat_id = public.my_flat() and not public.bill_is_tenant(bill_id));
drop policy if exists tenant_own on public.payments;
create policy tenant_own on public.payments for select to authenticated using (flat_id = public.my_tenant_flat() and public.bill_is_tenant(bill_id));

drop policy if exists resident_read on public.payment_reports;
create policy resident_read on public.payment_reports for select to authenticated
  using (flat_id = public.my_flat() and (bill_id is null or not public.bill_is_tenant(bill_id)));
drop policy if exists resident_add on public.payment_reports;
create policy resident_add on public.payment_reports for insert to authenticated
  with check (flat_id = public.my_flat() and status = 'pending' and payment_id is null and reviewed_by is null and verified_amount is null
              and (bill_id is null or exists (select 1 from public.bills b where b.id = bill_id and b.flat_id = public.my_flat() and not b.tenant_bill)));

-- the tenant reports "I have paid" for the booking invoice only
drop policy if exists tenant_read on public.payment_reports;
create policy tenant_read on public.payment_reports for select to authenticated using (flat_id = public.my_tenant_flat() and bill_id is not null and public.bill_is_tenant(bill_id));
drop policy if exists tenant_add on public.payment_reports;
create policy tenant_add on public.payment_reports for insert to authenticated
  with check (flat_id = public.my_tenant_flat() and status = 'pending' and payment_id is null and reviewed_by is null and verified_amount is null
              and exists (select 1 from public.bills b where b.id = bill_id and b.flat_id = public.my_tenant_flat() and b.tenant_bill and b.status = 'active'));
drop policy if exists tenant_withdraw on public.payment_reports;
create policy tenant_withdraw on public.payment_reports for delete to authenticated using (flat_id = public.my_tenant_flat() and status = 'pending');

-- 4. Who may set charges: Chairman / Secretary committee login (as for approving) or the main admin
create or replace function public.can_set_booking_charge() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_committee() and (public.can_approve_booking() or public.is_main_admin())
$$;

create or replace function public.set_booking_charge(p_area uuid, p_charge numeric)
returns void language plpgsql security definer set search_path = public as $$
declare a public.booking_areas; who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if not public.can_set_booking_charge() then raise exception 'Only the Chairman, the Secretary or the main admin can set booking charges.'; end if;
  if p_charge is null or p_charge < 0 or p_charge > 1000000 then raise exception 'Enter a charge between 0 and 10,00,000.'; end if;
  select * into a from public.booking_areas where id = p_area;
  if not found then raise exception 'Area not found.'; end if;
  if a.charge = round(p_charge, 2) then return; end if;
  update public.booking_areas set charge = round(p_charge, 2) where id = p_area;
  insert into public.access_log (actor, action, target, details)
  values (who, 'booking_charge_set', a.name, 'per day: ₹' || a.charge::text || ' → ₹' || round(p_charge, 2)::text);
end $$;

-- Direct edits (committee has full table rules): the charge, the free-event flag and the invoice link move only
-- through the functions, or by the Chairman / Secretary / main admin.
create or replace function public.booking_charge_guard() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'booking_areas' then
    if new.charge is distinct from old.charge and not public.can_set_booking_charge() then
      raise exception 'Only the Chairman, the Secretary or the main admin can set booking charges.'; end if;
  elsif (new.charge is distinct from old.charge or new.free_event is distinct from old.free_event or new.bill_id is distinct from old.bill_id
         or new.booked_by is distinct from old.booked_by) and not public.can_set_booking_charge() then
    raise exception 'Booking charges can be changed only by the Chairman, the Secretary or the main admin.';
  end if;
  return new;
end $$;
drop trigger if exists booking_areas_charge_guard on public.booking_areas;
create trigger booking_areas_charge_guard before update on public.booking_areas for each row execute function public.booking_charge_guard();
drop trigger if exists bookings_charge_guard on public.bookings;
create trigger bookings_charge_guard before update on public.bookings for each row execute function public.booking_charge_guard();

-- 5. Ask for a booking: full day; charge copied from the area; who booked; society event = committee, no charge
drop function if exists public.request_booking(text, uuid[], date, text, text);
create or replace function public.request_booking(p_flat text, p_areas uuid[], p_date date, p_slot text default 'day',
                                                  p_purpose text default null, p_free boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid(); aid uuid; a public.booking_areas; f public.flats;
        who text := coalesce(auth.jwt() ->> 'email', public.my_home_flat(), 'unknown'); v_role text; v_name text;
begin
  if not (public.is_committee() or (public.my_home_flat() is not null and public.my_home_flat() = p_flat)) then raise exception 'You can book only for your own flat.'; end if;
  if coalesce(p_free, false) and not public.is_committee() then raise exception 'Only the committee can book for a society event.'; end if;
  if p_areas is null or array_length(p_areas, 1) is null then raise exception 'Choose at least one area.'; end if;
  if not public.is_committee() and (p_date <= public.booking_today() or p_date > public.booking_today() + 90) then
    raise exception 'Bookings can be made from tomorrow up to 90 days ahead.';
  end if;
  select * into f from public.flats where id = p_flat;
  if not found then raise exception 'Flat not found.'; end if;
  v_role := case when public.is_committee() then 'committee' when public.my_tenant_flat() = p_flat then 'tenant' else 'owner' end;
  v_name := case when v_role = 'tenant' then coalesce(nullif(trim(f.tenant_name), ''), f.owner_name) else f.owner_name end;
  foreach aid in array p_areas loop
    select * into a from public.booking_areas where id = aid and active;
    if not found then raise exception 'Area not available.'; end if;
    perform pg_advisory_xact_lock(hashtext('booking_' || a.id::text || '_' || p_date::text));
    if exists (select 1 from public.bookings b where b.area_id = a.id and b.book_date = p_date and b.status in ('pending', 'approved')) then
      raise exception '% is already booked or requested on %. Please choose another date.', a.name, to_char(p_date, 'DD Mon YYYY');
    end if;
    insert into public.bookings (group_id, flat_id, area_id, area_name, book_date, slot, purpose, created_by, charge, booked_by, bill_name, free_event)
    values (g, p_flat, a.id, a.name, p_date, 'day', nullif(trim(coalesce(p_purpose, '')), ''), who,
            case when coalesce(p_free, false) then 0 else a.charge end, v_role, v_name, coalesce(p_free, false));
  end loop;
  return g;
end $$;

-- 6. Approve / not approve: on approval, the notice and banner (as before) and one invoice
create or replace function public.decide_booking(p_group uuid, p_approve boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare b public.bookings; areas text; n_areas int; all_active int; who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'unknown');
        slot_txt text; day_txt text; title text; body text; nid text; total numeric(12,2); s public.billing_settings; g public.signatories;
        bno text; bid uuid; lines jsonb; today date := public.booking_today();
begin
  if not public.can_approve_booking() then raise exception 'Only the Chairman or the Secretary can approve bookings.'; end if;
  select * into b from public.bookings where group_id = p_group and status = 'pending' limit 1 for update;
  if not found then raise exception 'This request is not waiting for approval.'; end if;
  if not p_approve then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Write a reason for the member.'; end if;
    update public.bookings set status = 'rejected', reason = trim(p_reason), decided_by = who, decided_at = now(), updated_at = now()
     where group_id = p_group and status = 'pending';
    return null;
  end if;
  select string_agg(area_name, ', ' order by area_name), count(*), coalesce(sum(charge) filter (where not free_event), 0)
    into areas, n_areas, total from public.bookings where group_id = p_group and status = 'pending';
  select count(*) into all_active from public.booking_areas where active;
  slot_txt := case b.slot when 'morning' then 'morning' when 'evening' then 'evening' else 'full day' end;
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

  if total > 0 then
    update public.billing_settings set other_last_no = other_last_no + 1 where id = 1 returning * into s;
    bno := s.other_prefix || lpad(s.other_last_no::text, greatest(s.num_digits, length(s.other_last_no::text)), '0');
    select * into g from public.signatories where id = s.bill_signer;
    select jsonb_agg(jsonb_build_object('description', 'Common plot booking – ' || area_name || ' – ' || to_char(book_date, 'DD Mon YYYY') || ' (full day)', 'amount', charge) order by area_name)
      into lines from public.bookings where group_id = p_group and status = 'pending' and not free_event and charge > 0;
    insert into public.bills (bill_no, flat_id, kind, bill_to, bill_date, due_date, lines, amount, signer_id, signer_name, signer_designation, created_by, tenant_bill)
    values (bno, b.flat_id, 'other', b.bill_name, today, today + coalesce(s.due_days, 30), coalesce(lines, '[]'::jsonb), total,
            g.id, g.name, g.designation, who, b.booked_by = 'tenant')
    returning id into bid;
  end if;
  update public.bookings set status = 'approved', decided_by = who, decided_at = now(), notice_id = nid, bill_id = bid, updated_at = now()
   where group_id = p_group and status = 'pending';
  return nid;
end $$;

-- 7. Cancel: as before (member until the day before), and the invoice is cancelled with the reason (no charge)
create or replace function public.cancel_booking(p_group uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings; who text := coalesce(auth.jwt() ->> 'email', public.my_home_flat(), 'unknown'); boss boolean := public.is_committee() or public.can_approve_booking();
begin
  select * into b from public.bookings where group_id = p_group and status in ('pending', 'approved') limit 1;
  if not found then raise exception 'Nothing to cancel.'; end if;
  if not boss then
    if public.my_home_flat() is distinct from b.flat_id then raise exception 'You can cancel only your own booking.'; end if;
    if b.book_date <= public.booking_today() then raise exception 'Bookings can be cancelled by the member only until the day before. Please contact the committee.'; end if;
    if b.bill_id is not null and exists (select 1 from public.payments p where p.bill_id = b.bill_id and p.status = 'active') then
      raise exception 'The invoice for this booking is already paid. Please contact the committee to cancel it and arrange the refund.'; end if;
  end if;
  update public.bookings set status = 'cancelled', reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = who, decided_at = now(), updated_at = now()
   where group_id = p_group and status in ('pending', 'approved');
  if b.notice_id is not null then
    update public.notices set title = 'CANCELLED – ' || title, content = 'This booking has been cancelled; the area is free.' || E'\n\n' || coalesce(content, ''), is_banner = false
     where id::text = b.notice_id and title not like 'CANCELLED%';
  end if;
  if b.bill_id is not null then
    update public.bills set status = 'cancelled', cancel_reason = 'Booking cancelled' || coalesce(': ' || nullif(trim(coalesce(p_reason, '')), ''), ''),
           cancelled_by = who, cancelled_at = now()
     where id = b.bill_id and status = 'active';
  end if;
end $$;

revoke all on function public.can_set_booking_charge(), public.set_booking_charge(uuid, numeric),
  public.request_booking(text, uuid[], date, text, text, boolean), public.decide_booking(uuid, boolean, text), public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.can_set_booking_charge(), public.set_booking_charge(uuid, numeric),
  public.request_booking(text, uuid[], date, text, text, boolean), public.decide_booking(uuid, boolean, text), public.cancel_booking(uuid, text) to authenticated;

-- Check: areas 4 (names), new columns 6, bill rules 2, payment rules 2, functions 5
select 'areas' as item, string_agg(name || ' ₹' || charge::text, ', ' order by sort) as value from public.booking_areas where active
union all select 'new columns', count(*)::text from information_schema.columns where table_schema = 'public'
  and ((table_name = 'bookings' and column_name in ('charge', 'booked_by', 'bill_name', 'free_event', 'bill_id'))
    or (table_name = 'bills' and column_name = 'tenant_bill'))
union all select 'bill rules (owner + tenant)', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'bills' and policyname in ('resident_own', 'tenant_own')
union all select 'payment rules (owner + tenant)', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname in ('resident_own', 'tenant_own')
union all select 'charge guards (expect 2)', count(*)::text from pg_trigger where tgname in ('booking_areas_charge_guard', 'bookings_charge_guard') and not tgisinternal
union all select 'functions', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('bill_is_tenant', 'can_set_booking_charge', 'set_booking_charge', 'request_booking', 'decide_booking')
union all select 'request_booking versions (expect 1)', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'request_booking';
