-- Complaints (item 19, 25 Oct 2026): a member raises a complaint for an area of responsibility
-- (COMMITTEE → RESPONSIBILITIES); it goes to that area's responsible member and backup, who close it with a note.
-- Run once in Supabase > SQL Editor, after COMMITTEE_AMC.sql. Safe to run again.
--
-- Who sees what:
--   * committee logins: every complaint; can change status, note, area
--   * a flat login: complaints raised by its flat, and complaints assigned to its flat (responsible member or backup)
--   * the responsible member / backup (from their flat login) can mark in progress and close
-- Numbers: CMP/26-27/0001 — one series per financial year (April–March), given by the database.

create table if not exists public.complaints (
  id            uuid primary key default gen_random_uuid(),
  complaint_no  text unique,
  flat_id       text not null,
  area_id       uuid references public.committee_areas(id) on delete set null,
  area_name     text,                     -- copy of the area name when raised
  assigned_flat text,                     -- responsible member's flat when raised (or when the area is changed)
  backup_flat   text,
  description   text not null check (length(trim(description)) between 5 and 2000),
  photo_key     text,                     -- R2 key under complaints/<flat>/
  status        text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  progress_note text,
  close_note    text,
  closed_at     timestamptz,
  closed_by     text,
  history       jsonb not null default '[]'::jsonb,   -- [{at, by, status, note}]
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists complaints_flat_idx on public.complaints (flat_id);
create index if not exists complaints_assigned_idx on public.complaints (assigned_flat);
create index if not exists complaints_status_idx on public.complaints (status);

-- New complaint: number, routing to the area's members, and a clean start (whoever inserts it).
create or replace function public.complaint_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; y int; fy text; n int;
begin
  y := extract(year from d)::int;
  if extract(month from d) < 4 then y := y - 1; end if;
  fy := lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  perform pg_advisory_xact_lock(hashtext('complaint_no_' || fy));
  select coalesce(max((substring(c.complaint_no from '(\d+)$'))::int), 0) + 1 into n
    from public.complaints c where c.complaint_no like 'CMP/' || fy || '/%';
  new.complaint_no := 'CMP/' || fy || '/' || lpad(n::text, 4, '0');
  select a.name, a.holder_flat, a.backup_flat into new.area_name, new.assigned_flat, new.backup_flat
    from public.committee_areas a where a.id = new.area_id;
  new.status := 'open'; new.progress_note := null; new.close_note := null; new.closed_at := null; new.closed_by := null;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  new.created_at := now(); new.updated_at := now();
  new.history := jsonb_build_array(jsonb_build_object('at', now(), 'by', new.created_by, 'status', 'open', 'note', 'raised'));
  return new;
end $$;
drop trigger if exists complaint_before_insert on public.complaints;
create trigger complaint_before_insert before insert on public.complaints for each row execute function public.complaint_before_insert();

-- Change status: committee logins, or the flat login of the responsible member / backup.
-- p_status: 'in_progress' | 'closed' | 'open' (reopen: committee only). Closing needs a note.
create or replace function public.update_complaint(p_id uuid, p_status text, p_note text default null)
returns public.complaints language plpgsql security definer set search_path = public as $$
declare c public.complaints; who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'unknown'); note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into c from public.complaints where id = p_id for update;
  if not found then raise exception 'Complaint not found.'; end if;
  if not (public.is_committee() or (public.my_flat() is not null and public.my_flat() in (c.assigned_flat, c.backup_flat))) then
    raise exception 'Only the committee or the member responsible for this area can change it.';
  end if;
  if p_status not in ('open', 'in_progress', 'closed') then raise exception 'Unknown status.'; end if;
  if p_status = 'open' and not public.is_committee() then raise exception 'Only the committee can reopen a complaint.'; end if;
  if p_status = 'closed' and note is null then raise exception 'Write what was done before closing.'; end if;
  update public.complaints set
    status = p_status,
    progress_note = case when p_status = 'in_progress' then coalesce(note, progress_note) else progress_note end,
    close_note = case when p_status = 'closed' then note when p_status = 'open' then null else close_note end,
    closed_at = case when p_status = 'closed' then now() else null end,
    closed_by = case when p_status = 'closed' then who else null end,
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'by', who, 'status', p_status, 'note', note)),
    updated_at = now()
  where id = p_id returning * into c;
  return c;
end $$;

-- Move a complaint to another area (committee only): it then goes to that area's members.
create or replace function public.reassign_complaint(p_id uuid, p_area uuid)
returns public.complaints language plpgsql security definer set search_path = public as $$
declare c public.complaints; a public.committee_areas; who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if not public.is_committee() then raise exception 'Only the committee can change the area.'; end if;
  select * into a from public.committee_areas where id = p_area;
  if not found then raise exception 'Area not found.'; end if;
  update public.complaints set area_id = a.id, area_name = a.name, assigned_flat = a.holder_flat, backup_flat = a.backup_flat,
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'by', who, 'status', status, 'note', 'moved to ' || a.name)),
    updated_at = now()
  where id = p_id returning * into c;
  if not found then raise exception 'Complaint not found.'; end if;
  return c;
end $$;

revoke all on function public.complaint_before_insert() from public, anon;
revoke all on function public.update_complaint(uuid, text, text) from public, anon;
revoke all on function public.reassign_complaint(uuid, uuid) from public, anon;
grant execute on function public.update_complaint(uuid, text, text) to authenticated;
grant execute on function public.reassign_complaint(uuid, uuid) to authenticated;

-- Rules
alter table public.complaints enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'complaints' loop
    execute format('drop policy %I on public.complaints', p.policyname);
  end loop;
end $$;
create policy committee_all on public.complaints for all to authenticated using (public.is_committee()) with check (public.is_committee());
create policy flat_read on public.complaints for select to authenticated
  using (public.my_flat() is not null and public.my_flat() in (flat_id, assigned_flat, backup_flat));
create policy flat_raise on public.complaints for insert to authenticated with check (flat_id = public.my_flat());
-- (flat logins change status only through update_complaint)

revoke all on public.complaints from anon;
grant select, insert, update, delete on public.complaints to authenticated, service_role;

-- Check: table 1, rules 3, functions 3
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'complaints') as tables,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'complaints') as rules,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('complaint_before_insert', 'update_complaint', 'reassign_complaint')) as functions;
