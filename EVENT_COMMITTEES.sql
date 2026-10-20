-- Event committees (Navratri, SPL cricket, etc.): organising team, event meetings (minutes) and event accounts.
-- Run once in Supabase > SQL Editor AFTER MINUTES.sql. Safe to run again. Does NOT change existing data.
-- Event money is kept completely separate from society billing (bills / payments / ledger).
--
-- Who can do what:
--   Society committee login ............ everything, for every event
--   Event CONVENOR (flat login) ........ manage the team (treasurer / members), write minutes, record money
--   Event TREASURER (flat login) ....... record money
--   Event team MEMBER (flat login) ..... see the team's minutes (drafts too) and the accounts
--   Every member ........................ the team list, FINAL event minutes, their own payments,
--                                         and the full accounts only if "show accounts to all members" is ticked

-- 1. Settings on the existing events
alter table public.events add column if not exists fund_per_flat numeric(12,2);     -- suggested contribution per flat
alter table public.events add column if not exists pass_price numeric(12,2);        -- member pass price
alter table public.events add column if not exists guest_pass_price numeric(12,2);  -- guest pass price
alter table public.events add column if not exists accounts_public boolean not null default false;

-- 2. Organising team
create table if not exists public.event_team (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  flat_id text not null references public.flats(id) on delete cascade,
  person text,                                  -- name if not the flat owner (e.g. son / daughter)
  role text not null default 'Member' check (role in ('Convenor', 'Treasurer', 'Member')),
  created_at timestamptz not null default now(),
  unique (event_id, flat_id)
);
create index if not exists event_team_event_idx on public.event_team(event_id);

-- 3. Event money book (money in and money out)
create table if not exists public.event_money (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  entry_date date not null default current_date,
  direction text not null check (direction in ('in', 'out')),
  category text not null,                       -- in: Member fund / Sponsorship / Passes / Donation / Other income
                                                -- out: Food / Prizes / Decoration / Sound & lights / Venue / Artists / Printing / Other expense
  flat_id text references public.flats(id) on delete set null,   -- paying / sponsoring flat (if a member)
  party text,                                   -- outside sponsor, vendor or buyer name
  purpose text,                                 -- e.g. "Day 3 dinner", "Garba prizes", "Adult passes"
  qty integer,                                  -- passes
  rate numeric(12,2),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  mode text not null default 'Cash' check (mode in ('Cash', 'UPI', 'Bank', 'Cheque', 'In kind')),   -- In kind = not counted in cash
  pass_type text check (pass_type in ('Member', 'Guest')),   -- passes only
  jain_qty integer,                             -- passes only: how many of the passes want Jain food (rest = normal)
  reference text, note text, file_url text,     -- UPI ref / cheque no., bill or receipt photo
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz
);
alter table public.event_money add column if not exists pass_type text check (pass_type in ('Member', 'Guest'));
alter table public.event_money add column if not exists jain_qty integer;
alter table public.event_money drop constraint if exists event_money_jain_check;
alter table public.event_money add constraint event_money_jain_check check (jain_qty is null or (jain_qty >= 0 and jain_qty <= coalesce(qty, 1)));
create index if not exists event_money_event_idx on public.event_money(event_id, entry_date);

-- 4. Event meetings use the existing minutes tables
alter table public.meetings add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.meetings drop constraint if exists meetings_kind_check;
alter table public.meetings add constraint meetings_kind_check check (kind in ('AGM', 'SGM', 'Committee', 'Event'));
alter table public.meetings drop constraint if exists meetings_event_check;
alter table public.meetings add constraint meetings_event_check check ((kind = 'Event') = (event_id is not null));

-- 5. Role of the logged-in flat in an event (null = not in the team)
create or replace function public.my_event_role(p_event uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.role from public.event_team t where t.event_id = p_event and public.my_flat() is not null and t.flat_id = public.my_flat() limit 1
$$;
revoke all on function public.my_event_role(uuid) from public, anon;
grant execute on function public.my_event_role(uuid) to authenticated;

-- 6. Rules
do $$ declare t text; p record; begin
  foreach t in array array['event_team','event_money'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
    execute format('revoke all on public.%I from anon', t);
    -- Supabase no longer grants new tables automatically (from 30 Oct 2026): grant explicitly; rows are still limited by the rules below
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;
-- team: everyone sees who organises; the convenor adds / removes treasurer and members
create policy members_read on public.event_team for select to authenticated using (true);
create policy convenor_add on public.event_team for insert to authenticated with check (role <> 'Convenor' and public.my_event_role(event_id) = 'Convenor');
create policy convenor_change on public.event_team for update to authenticated using (role <> 'Convenor' and public.my_event_role(event_id) = 'Convenor') with check (role <> 'Convenor' and public.my_event_role(event_id) = 'Convenor');
create policy convenor_remove on public.event_team for delete to authenticated using (role <> 'Convenor' and public.my_event_role(event_id) = 'Convenor');
-- money: team (or everyone when the event's accounts are public) reads; own payments always visible; convenor / treasurer write
create policy team_read on public.event_money for select to authenticated using (
  public.my_event_role(event_id) is not null or (public.my_flat() is not null and flat_id = public.my_flat())
  or exists (select 1 from public.events e where e.id = event_id and e.accounts_public));
create policy keepers_add on public.event_money for insert to authenticated with check (public.my_event_role(event_id) in ('Convenor', 'Treasurer'));
create policy keepers_change on public.event_money for update to authenticated using (public.my_event_role(event_id) in ('Convenor', 'Treasurer')) with check (public.my_event_role(event_id) in ('Convenor', 'Treasurer'));
create policy keepers_remove on public.event_money for delete to authenticated using (public.my_event_role(event_id) in ('Convenor', 'Treasurer'));
-- meetings of an event: team reads all (drafts too), every member reads FINAL; convenor writes
drop policy if exists event_team_read on public.meetings;
drop policy if exists members_read_event on public.meetings;
drop policy if exists convenor_write on public.meetings;
create policy event_team_read on public.meetings for select to authenticated using (kind = 'Event' and public.my_event_role(event_id) is not null);
create policy members_read_event on public.meetings for select to authenticated using (kind = 'Event' and status = 'final');
create policy convenor_write on public.meetings for all to authenticated
  using (kind = 'Event' and public.my_event_role(event_id) = 'Convenor') with check (kind = 'Event' and public.my_event_role(event_id) = 'Convenor');
drop policy if exists event_actions_read on public.meeting_actions;
drop policy if exists convenor_actions on public.meeting_actions;
create policy event_actions_read on public.meeting_actions for select to authenticated using (exists (select 1 from public.meetings m where m.id = meeting_id and m.kind = 'Event'
  and (m.status = 'final' or public.my_event_role(m.event_id) is not null)));
create policy convenor_actions on public.meeting_actions for all to authenticated
  using (exists (select 1 from public.meetings m where m.id = meeting_id and m.kind = 'Event' and public.my_event_role(m.event_id) = 'Convenor'))
  with check (exists (select 1 from public.meetings m where m.id = meeting_id and m.kind = 'Event' and public.my_event_role(m.event_id) = 'Convenor'));

-- 7. Convenor can set the fund / pass prices / "show accounts to all" of their own event
drop function if exists public.set_event_money_settings(uuid, numeric, numeric, boolean);
create or replace function public.set_event_money_settings(p_event uuid, p_fund numeric, p_pass numeric, p_guest numeric, p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_committee() or public.my_event_role(p_event) = 'Convenor') then raise exception 'Only the committee or the event convenor can change this.'; end if;
  update public.events set fund_per_flat = p_fund, pass_price = p_pass, guest_pass_price = p_guest, accounts_public = coalesce(p_public, false) where id = p_event;
end $$;
revoke all on function public.set_event_money_settings(uuid, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.set_event_money_settings(uuid, numeric, numeric, numeric, boolean) to authenticated;

-- Number of people living in each flat (counts only, no names), for default member passes.
-- Only the committee, or a convenor / treasurer of some event, can read it.
create or replace function public.flat_people_counts()
returns table(flat_id text, people integer) language sql stable security definer set search_path = public as $$
  select m.flat_id, count(*)::int from public.members m
  where public.is_committee()
     or exists (select 1 from public.event_team t where public.my_flat() is not null and t.flat_id = public.my_flat() and t.role in ('Convenor', 'Treasurer'))
  group by m.flat_id
$$;
revoke all on function public.flat_people_counts() from public, anon;
grant execute on function public.flat_people_counts() to authenticated;

-- 8. MY ACTION POINTS shows the event name; "view minutes" also works for event meetings
drop function if exists public.my_action_points();
create or replace function public.my_action_points()
returns table(id uuid, meeting_id uuid, task text, due_date date, status text, done_note text, meeting_kind text, meeting_date date, event_title text)
language sql stable security definer set search_path = public as $$
  select a.id, a.meeting_id, a.task, a.due_date, a.status, a.done_note, m.kind, m.meeting_date, e.title
  from public.meeting_actions a join public.meetings m on m.id = a.meeting_id left join public.events e on e.id = m.event_id
  where public.my_flat() is not null and a.owner_flat = public.my_flat()
  order by (a.status = 'done'), a.due_date nulls last
$$;
revoke all on function public.my_action_points() from public, anon;
grant execute on function public.my_action_points() to authenticated;

create or replace function public.my_meeting(p_meeting uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_committee()
                or exists (select 1 from public.meetings m where m.id = p_meeting and m.kind = 'Committee' and public.my_flat_is_committee())
                or exists (select 1 from public.meetings m where m.id = p_meeting and m.kind in ('AGM','SGM','Event') and m.status = 'final')
                or exists (select 1 from public.meetings m where m.id = p_meeting and m.kind = 'Event' and public.my_event_role(m.event_id) is not null)
                or exists (select 1 from public.meeting_actions a where a.meeting_id = p_meeting and a.owner_flat = public.my_flat())
    then jsonb_build_object('meeting', (select to_jsonb(m) || jsonb_build_object('event_title', e.title) from public.meetings m left join public.events e on e.id = m.event_id where m.id = p_meeting),
                            'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.meeting_actions a where a.meeting_id = p_meeting), '[]'::jsonb))
  end
$$;
revoke all on function public.my_meeting(uuid) from public, anon;
grant execute on function public.my_meeting(uuid) to authenticated;

-- 9. Backups and restore include the event team and event accounts
create or replace function public.restore_society_backup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ins text[] := array['flats','billing_settings','signatories','events','notices','maintenance','businesses',
                      'members','emergency_contacts','vehicles','flat_docs','bills','payments','letters','payment_reports','committee_areas','amc_contracts','amc_visits','meetings','meeting_actions',
                      'event_team','event_money'];
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

-- Check: should show tables 2, functions 5
select 'tables' as item, count(*)::text as value from pg_tables where schemaname = 'public' and tablename in ('event_team','event_money')
union all
select 'functions', count(*)::text from pg_proc where proname in ('my_event_role','set_event_money_settings','my_action_points','my_meeting','flat_people_counts');
