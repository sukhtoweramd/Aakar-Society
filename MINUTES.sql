-- Minutes of meetings (AGM, special general meeting, committee meeting) with action items.
-- Run once in Supabase > SQL Editor. Safe to run again. Does NOT change existing data.
-- Members see only FINAL minutes of general meetings (AGM / SGM); committee meetings stay with the committee.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('AGM', 'SGM', 'Committee')),
  meeting_date date not null,
  venue text, chaired_by text,
  attendees text,                 -- names, one per line (or "42 members present")
  agenda text,                    -- one item per line
  minutes text,                   -- discussion, decisions and resolutions
  file_url text,                  -- signed minutes (PDF / photo)
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_by text, created_at timestamptz not null default now(), updated_by text, updated_at timestamptz default now()
);
create index if not exists meetings_date_idx on public.meetings(meeting_date desc);

create table if not exists public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  task text not null,
  owner_flat text references public.flats(id) on delete set null,   -- responsible committee member's flat
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  done_note text, done_at timestamptz, done_by text,
  created_at timestamptz not null default now()
);
create index if not exists meeting_actions_meeting_idx on public.meeting_actions(meeting_id);

do $$ declare t text; p record; begin
  foreach t in array array['meetings','meeting_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy members_read_general on public.meetings for select to authenticated using (kind in ('AGM', 'SGM') and status = 'final');

-- A committee member sees and closes their own action points from their flat (flat login or linked committee login).
create or replace function public.my_action_points()
returns table(id uuid, task text, due_date date, status text, done_note text, meeting_kind text, meeting_date date)
language sql stable security definer set search_path = public as $$
  select a.id, a.task, a.due_date, a.status, a.done_note, m.kind, m.meeting_date
  from public.meeting_actions a join public.meetings m on m.id = a.meeting_id
  where public.my_flat() is not null and a.owner_flat = public.my_flat()
  order by (a.status = 'done'), a.due_date nulls last
$$;
revoke all on function public.my_action_points() from public, anon;
grant execute on function public.my_action_points() to authenticated;

create or replace function public.mark_my_action_done(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.meeting_actions set status = 'done', done_note = nullif(trim(p_note), ''), done_at = now(), done_by = auth.jwt() ->> 'email'
  where id = p_id and status = 'open' and (owner_flat = public.my_flat() or public.is_committee());
  if not found then raise exception 'This action point is not yours or is already done.'; end if;
end $$;
revoke all on function public.mark_my_action_done(uuid, text) from public, anon;
grant execute on function public.mark_my_action_done(uuid, text) to authenticated;

-- Backups and restore include meetings
create or replace function public.restore_society_backup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ins text[] := array['flats','billing_settings','signatories','events','notices','maintenance','businesses',
                      'members','emergency_contacts','vehicles','flat_docs','bills','payments','letters','payment_reports','committee_areas','amc_contracts','amc_visits','meetings','meeting_actions'];
  t text; i int; cols text; n int; seq text; col record; result jsonb := '{}'::jsonb;
begin
  if p is null or p->>'app' is distinct from 'aakar-society' or jsonb_typeof(p->'tables') <> 'object' then
    raise exception 'This is not an Aakar Society backup file.';
  end if;
  if not (p->'tables' ? 'flats') or jsonb_array_length(p->'tables'->'flats') = 0 then
    raise exception 'The backup has no flats; restore stopped.';
  end if;
  -- remove current records, children first (only tables that are in the backup)
  for i in reverse array_length(ins, 1)..1 loop
    t := ins[i];
    if to_regclass('public.' || t) is not null and (p->'tables') ? t then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
  -- put the backup's records back, parents first
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
    -- keep running numbers (ids) ahead of the restored rows
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

-- Check: should show 3 rules and 2 functions
select 'rules' as item, count(*)::text as value from pg_policies where schemaname = 'public' and tablename in ('meetings','meeting_actions')
union all
select 'functions', count(*)::text from pg_proc where proname in ('my_action_points','mark_my_action_done');
