-- Gate scanning for event passes (27 Oct 2026): the event team scans a pass at the gate and enters how many people
-- are coming in now. Each entry is counted against that flat's number for that meal, so a pass can never be used for
-- more people than it is for (family members coming at different times share the same pass). The caterer count
-- then shows ATTENDED next to REGISTERED.
-- Run once in Supabase > SQL Editor AFTER EVENT_REGISTRATION.sql. Safe to run again. Does NOT change existing data.
-- Then run sql-security/07_RESTORE_event_checkins.sql so backups / restore include the entries.
--
-- Who can do what:
--   Society committee / every member of that event's team ... scan passes and let people in
--   Committee / event CONVENOR / TREASURER ................... undo any entry made by mistake
--   The team member who made an entry ........................ undo it within 15 minutes
--   A flat ................................................... sees its own entries (how many of its pass are used)

-- 1. One row per entry at the gate
create table if not exists public.event_checkins (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  reg_id     uuid not null references public.event_registrations(id) on delete cascade,
  flat_id    text not null,
  session_id text not null,
  people     int  not null check (people between 1 and 200),
  scanned_by text,
  created_at timestamptz not null default now()
);
create index if not exists event_checkins_reg_idx on public.event_checkins(reg_id, session_id);
create index if not exists event_checkins_event_idx on public.event_checkins(event_id, created_at);

-- 2. Rules: entries are made only through gate_pass() below
alter table public.event_checkins enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_checkins' loop
    execute format('drop policy %I on public.event_checkins', p.policyname);
  end loop;
end $$;
create policy committee_all on public.event_checkins for all to authenticated using (public.is_committee()) with check (public.is_committee());
create policy team_or_own_read on public.event_checkins for select to authenticated using (
  public.my_event_role(event_id) is not null or (public.my_flat() is not null and flat_id = public.my_flat()));
revoke all on public.event_checkins from anon;
grant select, insert, update, delete on public.event_checkins to authenticated, service_role;

-- 3. Check a pass and (with p_people) let people in.
--    p_code is what the QR holds: AKP1|<registration id>|<session id>|<pass code>
--    Without p_people: only shows the pass (flat, meal, allowed, already in). With p_people: records the entry.
--    Returns {flat_id, session_id, session, allowed, used, left, paid, last_at, entered}
create or replace function public.gate_pass(p_code text, p_people int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  parts text[] := string_to_array(coalesce(p_code, ''), '|');
  r public.event_registrations; ev public.events; s jsonb; c jsonb;
  allowed int; used int; last_at timestamptz; paid boolean; who text := auth.jwt() ->> 'email';
begin
  if array_length(parts, 1) is distinct from 4 or parts[1] <> 'AKP1' or parts[2] !~ '^[0-9a-f-]{36}$' then
    raise exception 'This is not an Aakar event pass.';
  end if;
  select * into r from public.event_registrations where id = parts[2]::uuid for update;
  if r.id is null or r.pass_code is distinct from parts[4] then raise exception 'Pass not valid (cancelled or changed). Ask the convenor.'; end if;
  if not coalesce(public.is_committee() or public.my_event_role(r.event_id) is not null, false) then
    raise exception 'Only the event team can scan passes.';
  end if;
  select * into ev from public.events where id = r.event_id;
  select e.value into s from jsonb_array_elements(ev.pass_sessions) e where e.value->>'id' = parts[3] limit 1;
  if s is null then raise exception 'This meal is no longer in the event.'; end if;
  c := r.counts -> parts[3];
  allowed := coalesce((c->>'mr')::int, 0) + coalesce((c->>'mj')::int, 0) + coalesce((c->>'gr')::int, 0) + coalesce((c->>'gj')::int, 0);
  if allowed = 0 then raise exception 'This flat is not registered for %.', s->>'name'; end if;
  paid := coalesce(r.amount, 0) = 0 or r.pay_status = 'verified';
  select coalesce(sum(k.people), 0), max(k.created_at) into used, last_at
    from public.event_checkins k where k.reg_id = r.id and k.session_id = parts[3];
  if p_people is not null then
    if not paid then raise exception 'Payment for this pass is not confirmed yet. Ask the convenor or treasurer.'; end if;
    if p_people < 1 then raise exception 'Enter how many are coming in.'; end if;
    if used >= allowed then
      raise exception 'Pass full: all % already in (last entry %).', allowed, to_char(last_at at time zone 'Asia/Kolkata', 'HH12:MI am');
    end if;
    if used + p_people > allowed then
      raise exception 'Only % more can come in on this pass (% of % already in).', greatest(allowed - used, 0), used, allowed;
    end if;
    insert into public.event_checkins (event_id, reg_id, flat_id, session_id, people, scanned_by)
    values (r.event_id, r.id, r.flat_id, parts[3], p_people, coalesce(who, public.my_flat()));
    used := used + p_people; last_at := now();
  end if;
  return jsonb_build_object('reg_id', r.id, 'flat_id', r.flat_id, 'session_id', parts[3], 'session', s->>'name',
    'allowed', allowed, 'used', used, 'left', greatest(allowed - used, 0), 'paid', paid, 'last_at', last_at, 'entered', coalesce(p_people, 0));
end $$;
revoke all on function public.gate_pass(text, int) from public, anon;
grant execute on function public.gate_pass(text, int) to authenticated;

-- 4. Undo an entry made by mistake
create or replace function public.gate_undo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k public.event_checkins; who text := coalesce(auth.jwt() ->> 'email', public.my_flat());
begin
  select * into k from public.event_checkins where id = p_id;
  if k.id is null then raise exception 'Entry not found.'; end if;
  if not coalesce(public.is_committee() or public.my_event_role(k.event_id) in ('Convenor', 'Treasurer')
          or (public.my_event_role(k.event_id) is not null and k.scanned_by = who and k.created_at > now() - interval '15 minutes'), false) then
    raise exception 'Only the convenor or treasurer can undo this entry (or the person who made it, within 15 minutes).';
  end if;
  delete from public.event_checkins where id = p_id;
end $$;
revoke all on function public.gate_undo(uuid) from public, anon;
grant execute on function public.gate_undo(uuid) to authenticated;

-- Check: should show tables 1, rules 2, functions 2
select 'tables' as item, count(*)::text as value from pg_tables where schemaname = 'public' and tablename = 'event_checkins'
union all select 'rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'event_checkins'
union all select 'functions', count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('gate_pass', 'gate_undo');
