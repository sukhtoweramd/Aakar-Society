-- UNDO of AREAS_BACKUPS.sql: back to one backup per area, any committee login may change areas (as before 30 Oct 2026).
-- The first backup of each area stays in backup_flat; the other backups are removed. Safe to re-run.

drop trigger if exists committee_areas_guard on public.committee_areas;
drop function if exists public.committee_areas_guard();
drop policy if exists committee_read on public.committee_areas;
drop policy if exists committee_add on public.committee_areas;
drop policy if exists committee_change on public.committee_areas;
drop policy if exists committee_all on public.committee_areas;
create policy committee_all on public.committee_areas for all to authenticated using (public.is_committee()) with check (public.is_committee());

-- complaints: functions and rule exactly as in COMPLAINTS.sql
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

drop policy if exists flat_read on public.complaints;
create policy flat_read on public.complaints for select to authenticated
  using (public.my_flat() is not null and public.my_flat() in (flat_id, assigned_flat, backup_flat));

alter table public.complaints drop column if exists backup_flats;
alter table public.committee_areas drop column if exists backup_flats;
alter table public.app_settings drop constraint if exists app_settings_area_backup_limit_check;
alter table public.app_settings drop column if exists area_backup_limit;
drop function if exists public.area_rights();
drop function if exists public.can_assign_areas();
drop function if exists public.is_main_admin();

-- Check (expected): backup lists column false • guard gone true • area rules 2
select 'backup lists column' as item, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'committee_areas' and column_name = 'backup_flats')::text as value
union all select 'guard gone', (not exists (select 1 from pg_trigger where tgname = 'committee_areas_guard'))::text
union all select 'area rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'committee_areas';
