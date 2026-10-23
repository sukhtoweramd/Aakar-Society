-- Event registration by members: meals / sessions, counts (regular / Jain, members / guests), payment, passes.
-- Run once in Supabase > SQL Editor AFTER EVENT_COMMITTEES.sql. Safe to run again. Does NOT change existing data.
--
-- Who can do what:
--   Society committee / event CONVENOR ... set the sessions, prices, last date; open or close registration
--   Every flat login ...................... register its own flat (until the last date), pay by UPI (screenshot) or cash
--   Event CONVENOR / TREASURER ............ see all registrations, confirm or reject payments, enter for a flat
--   Event team member who received cash ... confirm that cash
--   A confirmed payment is added to the event accounts (Passes) automatically.

-- 1. Registration settings on each event
--    pass_sessions: [{"id":"s1","name":"Dinner","date":"2026-10-20","member_price":150,"guest_price":250,"ask_jain":true}, ...]
--    member_price 0 = free; guest_price null = guests not allowed
alter table public.events add column if not exists pass_sessions jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists reg_open boolean not null default false;
alter table public.events add column if not exists reg_deadline timestamptz;
alter table public.events add column if not exists reg_upi text;
alter table public.events add column if not exists reg_prefill boolean not null default true;

-- 2. One registration per flat per event
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  flat_id text not null references public.flats(id) on delete cascade,
  counts jsonb not null default '{}'::jsonb,       -- {"s1": {"mr": 3, "mj": 1, "gr": 2, "gj": 0}}  m = members, g = guests, r = regular, j = Jain
  amount numeric(12,2) not null default 0,         -- worked out by the database from the prices
  pay_status text not null default 'none' check (pay_status in ('none', 'submitted', 'verified', 'rejected')),
  pay_mode text check (pay_mode in ('UPI', 'Cash')),
  pay_amount numeric(12,2), pay_date date, pay_ref text, pay_bank text,
  proof_key text,                                  -- payment screenshot (private storage)
  cash_to text references public.flats(id) on delete set null,   -- event team member who received the cash
  reject_reason text, verified_by text, verified_at timestamptz,
  money_id uuid references public.event_money(id) on delete set null,
  pass_code text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz,
  unique (event_id, flat_id)
);
create index if not exists event_registrations_event_idx on public.event_registrations(event_id);

-- 3. Rules: the flat sees its own registration; the event team and committee see all of that event.
--    Changes go only through the functions below (which check the rules and work out the amount).
alter table public.event_registrations enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_registrations' loop
    execute format('drop policy %I on public.event_registrations', p.policyname);
  end loop;
end $$;
create policy committee_all on public.event_registrations for all to authenticated using (public.is_committee()) with check (public.is_committee());
create policy own_or_team_read on public.event_registrations for select to authenticated using (
  (public.my_flat() is not null and flat_id = public.my_flat()) or public.my_event_role(event_id) is not null);
revoke all on public.event_registrations from anon;
grant select, insert, update, delete on public.event_registrations to authenticated, service_role;

-- 4. Settings (committee or the event's convenor)
create or replace function public.set_event_registration(p_event uuid, p_sessions jsonb, p_open boolean, p_deadline timestamptz, p_upi text, p_prefill boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if not coalesce(public.is_committee() or public.my_event_role(p_event) = 'Convenor', false) then raise exception 'Only the committee or the event convenor can change this.'; end if;
  if jsonb_typeof(coalesce(p_sessions, '[]'::jsonb)) <> 'array' then raise exception 'Sessions must be a list.'; end if;
  for s in select * from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) loop
    if coalesce(s->>'id', '') = '' or coalesce(trim(s->>'name'), '') = '' then raise exception 'Every session needs a name.'; end if;
    if coalesce((s->>'member_price')::numeric, 0) < 0 or coalesce((s->>'guest_price')::numeric, 0) < 0 then raise exception 'Prices cannot be negative.'; end if;
  end loop;
  update public.events set pass_sessions = coalesce(p_sessions, '[]'::jsonb), reg_open = coalesce(p_open, false), reg_deadline = p_deadline,
         reg_upi = nullif(trim(coalesce(p_upi, '')), ''), reg_prefill = coalesce(p_prefill, true) where id = p_event;
end $$;
revoke all on function public.set_event_registration(uuid, jsonb, boolean, timestamptz, text, boolean) from public, anon;
grant execute on function public.set_event_registration(uuid, jsonb, boolean, timestamptz, text, boolean) to authenticated;

-- 5. Register (or change) a flat's numbers. Returns the saved row.
--    A flat registers itself while registration is open; the committee / convenor / treasurer can enter for any flat at any time.
create or replace function public.register_for_event(p_event uuid, p_flat text, p_counts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev public.events; keeper boolean; flat text; s jsonb; c jsonb; clean jsonb := '{}'::jsonb;
  mr int; mj int; gr int; gj int; amt numeric := 0; people int := 0; cur public.event_registrations; r public.event_registrations;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found.'; end if;
  keeper := coalesce(public.is_committee(), false) or coalesce(public.my_event_role(p_event) in ('Convenor', 'Treasurer'), false);
  flat := coalesce(nullif(p_flat, ''), public.my_flat());
  if flat is null then raise exception 'Choose the flat.'; end if;
  if not keeper then
    if public.my_flat() is null or flat is distinct from public.my_flat() then raise exception 'You can register only your own flat.'; end if;
    if not coalesce(ev.reg_open, false) then raise exception 'Registration for this event is not open.'; end if;
    if ev.reg_deadline is not null and now() > ev.reg_deadline then raise exception 'The last date to register has passed. Please contact the event team.'; end if;
  end if;
  select * into cur from public.event_registrations where event_id = p_event and flat_id = flat;
  if cur.id is not null and cur.pay_status in ('submitted', 'verified') and not keeper then
    raise exception 'Your payment is already sent. Please ask the event team to change the numbers.';
  end if;
  for s in select * from jsonb_array_elements(ev.pass_sessions) loop
    c := coalesce(p_counts -> (s->>'id'), '{}'::jsonb);
    mr := greatest(0, least(60, coalesce((c->>'mr')::int, 0))); mj := greatest(0, least(60, coalesce((c->>'mj')::int, 0)));
    gr := greatest(0, least(60, coalesce((c->>'gr')::int, 0))); gj := greatest(0, least(60, coalesce((c->>'gj')::int, 0)));
    if not coalesce((s->>'ask_jain')::boolean, false) then mr := mr + mj; mj := 0; gr := gr + gj; gj := 0; end if;
    if (s->>'guest_price') is null and gr + gj > 0 then raise exception 'Guests are not allowed for %.', s->>'name'; end if;
    if mr + mj + gr + gj > 0 then
      clean := clean || jsonb_build_object(s->>'id', jsonb_build_object('mr', mr, 'mj', mj, 'gr', gr, 'gj', gj));
      amt := amt + (mr + mj) * coalesce((s->>'member_price')::numeric, 0) + (gr + gj) * coalesce((s->>'guest_price')::numeric, 0);
      people := people + mr + mj + gr + gj;
    end if;
  end loop;
  if people = 0 then
    if cur.id is not null and cur.pay_status = 'verified' then raise exception 'This flat has paid; the event team must refund before cancelling.'; end if;
    delete from public.event_registrations where id = cur.id;
    return null;
  end if;
  insert into public.event_registrations as x (event_id, flat_id, counts, amount, created_by)
  values (p_event, flat, clean, amt, auth.jwt() ->> 'email')
  on conflict (event_id, flat_id) do update set counts = excluded.counts, amount = excluded.amount, updated_at = now(),
    pay_status = case when x.pay_status = 'rejected' then 'none' else x.pay_status end
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.register_for_event(uuid, text, jsonb) from public, anon;
grant execute on function public.register_for_event(uuid, text, jsonb) to authenticated;

-- 6. "I have paid": UPI (with screenshot) or cash to a team member
create or replace function public.submit_event_payment(p_reg uuid, p_mode text, p_amount numeric, p_date date, p_ref text, p_bank text, p_proof text, p_cash_to text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.event_registrations;
begin
  select * into r from public.event_registrations where id = p_reg;
  if r.id is null then raise exception 'Registration not found.'; end if;
  if not coalesce(public.is_committee() or public.my_event_role(r.event_id) in ('Convenor', 'Treasurer') or (public.my_flat() is not null and r.flat_id = public.my_flat()), false) then
    raise exception 'Not your registration.'; end if;
  if r.pay_status = 'verified' then raise exception 'This payment is already confirmed.'; end if;
  if p_mode not in ('UPI', 'Cash') then raise exception 'Choose UPI or cash.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount paid.'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'Enter the date paid (not a future date).'; end if;
  if p_mode = 'Cash' and not exists (select 1 from public.event_team t where t.event_id = r.event_id and t.flat_id = p_cash_to) then
    raise exception 'Choose the event team member you paid.'; end if;
  if p_proof is not null and p_proof not like 'payproofs/' || r.flat_id || '/%' then raise exception 'Bad screenshot.'; end if;
  update public.event_registrations set pay_status = 'submitted', pay_mode = p_mode, pay_amount = round(p_amount, 2), pay_date = p_date,
         pay_ref = nullif(trim(coalesce(p_ref, '')), ''), pay_bank = nullif(trim(coalesce(p_bank, '')), ''), proof_key = p_proof,
         cash_to = case when p_mode = 'Cash' then p_cash_to end, reject_reason = null, updated_at = now()
   where id = p_reg;
end $$;
revoke all on function public.submit_event_payment(uuid, text, numeric, date, text, text, text, text) from public, anon;
grant execute on function public.submit_event_payment(uuid, text, numeric, date, text, text, text, text) to authenticated;

-- 7. Confirm or reject a payment. Convenor / treasurer / committee for any; a team member only for cash paid to them.
--    Confirming adds the money to the event accounts (Passes).
create or replace function public.verify_event_payment(p_reg uuid, p_ok boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.event_registrations; mid uuid; people int; jain int; who text := auth.jwt() ->> 'email';
begin
  select * into r from public.event_registrations where id = p_reg;
  if r.id is null then raise exception 'Registration not found.'; end if;
  if not coalesce(public.is_committee() or public.my_event_role(r.event_id) in ('Convenor', 'Treasurer')
          or (r.pay_mode = 'Cash' and public.my_flat() is not null and r.cash_to = public.my_flat() and public.my_event_role(r.event_id) is not null), false) then
    raise exception 'Only the event convenor / treasurer, or the person who received the cash, can confirm this.'; end if;
  if r.pay_status <> 'submitted' then raise exception 'Nothing to confirm.'; end if;
  if not p_ok then
    update public.event_registrations set pay_status = 'rejected', reject_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Payment not found'),
           verified_by = who, verified_at = now(), updated_at = now() where id = p_reg;
    return;
  end if;
  select coalesce(sum((v->>'mr')::int + (v->>'mj')::int + (v->>'gr')::int + (v->>'gj')::int), 0), coalesce(sum((v->>'mj')::int + (v->>'gj')::int), 0)
    into people, jain from jsonb_each(r.counts) as e(k, v);
  insert into public.event_money (event_id, entry_date, direction, category, flat_id, purpose, qty, rate, amount, mode, jain_qty, reference, note, file_url, created_by)
  values (r.event_id, r.pay_date, 'in', 'Passes', r.flat_id, 'Event registration', nullif(people, 0), null, r.pay_amount,
          r.pay_mode, case when people > 0 then least(jain, people) end, r.pay_ref,
          case when r.pay_mode = 'Cash' then 'Cash received by ' || coalesce(r.cash_to, '') || ', confirmed by ' || coalesce(who, '') else 'UPI screenshot checked by ' || coalesce(who, '') end,
          null, who)
  returning id into mid;
  update public.event_registrations set pay_status = 'verified', verified_by = who, verified_at = now(), money_id = mid, updated_at = now() where id = p_reg;
end $$;
revoke all on function public.verify_event_payment(uuid, boolean, text) from public, anon;
grant execute on function public.verify_event_payment(uuid, boolean, text) to authenticated;

-- 8. Backups and restore include registrations
create or replace function public.restore_society_backup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ins text[] := array['flats','billing_settings','signatories','events','notices','maintenance','businesses',
                      'members','emergency_contacts','vehicles','flat_docs','bills','payments','letters','payment_reports','committee_areas','amc_contracts','amc_visits','meetings','meeting_actions',
                      'event_team','event_money','event_registrations'];
  t text; i int; cols text; n int; seq text; col record; result jsonb := '{}'::jsonb;
begin
  if p is null or p->>'app' is distinct from 'aakar-society' or jsonb_typeof(p->'tables') <> 'object' then
    raise exception 'This is not an Aakar Society backup file.';
  end if;
  if not (p->'tables' ? 'flats') or jsonb_array_length(p->'tables'->'flats') = 0 then
    raise exception 'The backup has no flats; restore stopped.';
  end if;
  for i in reverse array_length(ins, 1)..1 loop
    t := ins[i];
    if to_regclass('public.' || t) is not null and (p->'tables') ? t then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
  foreach t in array ins loop
    if to_regclass('public.' || t) is null or not ((p->'tables') ? t) then continue; end if;
    if jsonb_array_length(p->'tables'->t) = 0 then result := result || jsonb_build_object(t, 0); continue; end if;
    select string_agg(quote_ident(a.attname), ',') into cols
      from pg_attribute a
     where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and (p->'tables'->t->0) ? a.attname;
    execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)',
                   t, cols, cols, t) using p->'tables'->t;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(t, n);
    for col in select a.attname from pg_attribute a
                where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped loop
      seq := pg_get_serial_sequence('public.' || t, col.attname);
      if seq is not null then
        execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', seq, col.attname, t);
      end if;
    end loop;
  end loop;
  return result;
end $$;
revoke all on function public.restore_society_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_society_backup(jsonb) to service_role;

-- Check: should show tables 1, functions 4
select 'tables' as item, count(*)::text as value from pg_tables where schemaname = 'public' and tablename = 'event_registrations'
union all
select 'functions', count(*)::text from pg_proc where proname in ('set_event_registration','register_for_event','submit_event_payment','verify_event_payment');
