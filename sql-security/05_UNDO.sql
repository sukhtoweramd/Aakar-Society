-- 05 UNDO · Puts back the flat guard, booking approval, "I have paid" rule and my_flat() access exactly as before 05
-- (Aakar security fixes, Oct 2026). Use only if 05 causes a problem. No data is changed.

-- 1. Flat row guard as in PRE_PHASE2_A.sql (the version that was live on 25 Oct 2026)
create or replace function public.flats_resident_guard() returns trigger
language plpgsql as $$
begin
  if public.is_committee() then return new; end if;
  if new.id is distinct from old.id or new.tower is distinct from old.tower or new.floor is distinct from old.floor
     or new.flat_no is distinct from old.flat_no or new.bhk is distinct from old.bhk
     or new.maintenance is distinct from old.maintenance or new.sqft is distinct from old.sqft
     or new.status is distinct from old.status or new.is_committee is distinct from old.is_committee
     or new.committee_role is distinct from old.committee_role
     or new.member_since is distinct from old.member_since or new.share_cert_no is distinct from old.share_cert_no
     or new.edit_code is distinct from old.edit_code then
    raise exception 'Residents can only change owner name, email and documents. Ask the committee for other changes.';
  end if;
  if old.occupancy = 'tenant' and (new.occupancy is distinct from old.occupancy
     or new.owner_name is distinct from old.owner_name or new.owner_mobile is distinct from old.owner_mobile
     or new.owner_address is distinct from old.owner_address or new.email is distinct from old.email) then
    raise exception 'This flat is rented out. Only the committee can change the owner details or mark the tenant as moved out.';
  end if;
  return new;
end $$;
drop trigger if exists flats_resident_guard on public.flats;
create trigger flats_resident_guard before update on public.flats for each row execute function public.flats_resident_guard();

-- 2. Booking approval as in BOOKINGS.sql
create or replace function public.can_approve_booking() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.flats f where f.id = public.my_flat() and f.committee_role ~* '(chair|secretary)')
      or (public.is_committee() and not exists (select 1 from public.flats f where f.committee_role ~* '(chair|secretary)'))
$$;

-- 3. "I have paid" insert rule as in PAYMENT_REPORTS.sql
drop policy if exists resident_add on public.payment_reports;
create policy resident_add on public.payment_reports for insert to authenticated
  with check (flat_id = public.my_flat() and status = 'pending' and payment_id is null and reviewed_by is null and verified_amount is null);

-- 4. my_flat() callable by everyone, as before
grant execute on function public.my_flat() to public;

-- Check: every row should be true
select 'flat guard back to old' as item, (pg_get_functiondef('public.flats_resident_guard()'::regprocedure) like '%Residents can only change owner name%')::text as value
union all select 'booking approval back to old', (pg_get_functiondef('public.can_approve_booking()'::regprocedure) like '%(chair|secretary)%')::text
union all select 'paid report rule back to old', (select bool_and(with_check not like '%bills%') from pg_policies where schemaname = 'public' and tablename = 'payment_reports' and policyname = 'resident_add')::text;
