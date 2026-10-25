-- Common plot bookings (item 21, 25 Oct 2026).
-- Areas TOWER-A, TOWER-B and COMMON; booked per date, MORNING or EVENING; no charge in the app.
-- A member asks; the Chairman OR the Secretary approves (either one). On approval the app posts a notice + login banner:
--   "<area> is booked by flat <no.> on <date> (<slot>). Please remove vehicles parked there."
--   all three areas booked together → "all vehicles should be parked outside the premises".
-- A member can cancel until the day before; a cancelled booking marks its notice CANCELLED.
-- Run once in Supabase > SQL Editor, after BANNERS.sql. Safe to run again.

-- 1. Areas (the committee can rename, add or hide them later)
create table if not exists public.booking_areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  sort        int not null default 1,
  active      boolean not null default true
);
insert into public.booking_areas (name, sort) values ('TOWER-A', 1), ('TOWER-B', 2), ('COMMON', 3) on conflict (name) do nothing;

-- 2. Bookings: one row per area; areas asked for together share a group_id
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null,
  flat_id     text not null,
  area_id     uuid not null references public.booking_areas(id),
  area_name   text not null,
  book_date   date not null,
  slot        text not null check (slot in ('morning', 'evening')),
  purpose     text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason      text,                 -- why rejected / cancelled
  decided_by  text,
  decided_at  timestamptz,
  notice_id   text,                 -- the "remove vehicles" notice made on approval
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bookings_group_idx on public.bookings (group_id);
create index if not exists bookings_flat_idx on public.bookings (flat_id);
create index if not exists bookings_date_idx on public.bookings (book_date);
-- one live request or booking per area, date and slot
create unique index if not exists bookings_slot_taken on public.bookings (area_id, book_date, slot) where status in ('pending', 'approved');

-- 3. Who approves: logins linked to the flat of the Chairman or the Secretary (committee login or that flat's login).
--    If no flat has either role yet, any committee login can approve.
create or replace function public.can_approve_booking() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.flats f where f.id = public.my_flat() and f.committee_role ~* '(chair|secretary)')
      or (public.is_committee() and not exists (select 1 from public.flats f where f.committee_role ~* '(chair|secretary)'))
$$;

create or replace function public.booking_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create or replace function public.booking_flat_label(p text) returns text language sql immutable as $$ select regexp_replace(coalesce(p, ''), '^([A-Z])', '\1-') $$;

-- 4. Ask for a booking (member for own flat, from tomorrow up to 90 days ahead; committee for any flat and date)
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

-- 5. Approve or reject (Chairman / Secretary). Approval posts the notice and login banner.
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

-- 6. Cancel: the member until the day before; the Chairman / Secretary / committee at any time (with a reason)
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

-- 7. What is taken (for every login, so members see free slots). No purpose or names, only flat and status.
create or replace function public.booked_slots(p_from date, p_to date)
returns table (area_id uuid, book_date date, slot text, status text, flat_id text)
language sql stable security definer set search_path = public as $$
  select b.area_id, b.book_date, b.slot, b.status, b.flat_id from public.bookings b
  where b.status in ('pending', 'approved') and b.book_date between p_from and least(p_to, p_from + 120)
$$;

revoke all on function public.can_approve_booking(), public.request_booking(text, uuid[], date, text, text), public.decide_booking(uuid, boolean, text),
  public.cancel_booking(uuid, text), public.booked_slots(date, date) from public, anon;
grant execute on function public.can_approve_booking(), public.request_booking(text, uuid[], date, text, text), public.decide_booking(uuid, boolean, text),
  public.cancel_booking(uuid, text), public.booked_slots(date, date), public.booking_today(), public.booking_flat_label(text) to authenticated;

-- 8. Rules: committee everything; approvers read all; a flat reads its own. Changes only through the functions above.
alter table public.booking_areas enable row level security;
alter table public.bookings enable row level security;
do $$ declare t text; p record; begin
  foreach t in array array['booking_areas', 'bookings'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
  end loop;
end $$;
create policy everyone_read on public.booking_areas for select to authenticated using (true);
create policy approver_read on public.bookings for select to authenticated using (public.can_approve_booking());
create policy own_flat_read on public.bookings for select to authenticated using (flat_id = public.my_flat());

revoke all on public.booking_areas, public.bookings from anon;
grant select, insert, update, delete on public.booking_areas, public.bookings to authenticated, service_role;

-- Check: tables 2, rules 5, functions 7, areas 3
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('booking_areas', 'bookings')) as tables,
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('booking_areas', 'bookings')) as rules,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
          ('can_approve_booking', 'booking_today', 'booking_flat_label', 'request_booking', 'decide_booking', 'cancel_booking', 'booked_slots')) as functions,
       (select count(*) from public.booking_areas) as areas;
