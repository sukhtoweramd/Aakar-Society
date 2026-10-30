-- Areas of responsibility: one responsible member + several backups, and who may change what (30 Oct 2026).
-- Run once in Supabase → SQL Editor after COMMITTEE_AMC.sql and COMPLAINTS.sql. Safe to re-run.
--
--   • committee_areas.backup_flats: list of backup flats (usually 3–4; maximum = app_settings.area_backup_limit, default 4).
--     The old single backup_flat is copied in and kept equal to the first backup (older screens keep working).
--   • Rules (checked in the database):
--       - areas (add, rename, covers, phone shown to members, order, show/hide): the MAIN ADMIN login only
--         (= the oldest committee login, the society's own account, as in lib/backup.ts);
--       - responsible member and backups: a committee login linked to the flat marked exactly Chairman or Secretary,
--         or the main admin;
--       - the responsible member cannot also be a backup of the same area; no flat twice; at most the limit;
--       - a flat newly chosen must be on the committee (flats.is_committee). Someone who LEAVES the committee stays
--         where they are until replaced (the screen shows "not on committee — replace"); nothing is deleted;
--       - areas cannot be deleted (hide them instead).
--     The SQL Editor / server (no login) is not checked, so restores and this script keep working.
--   • Complaints go to the responsible member and ALL backups (complaints.backup_flats).
-- Undo: AREAS_BACKUPS_UNDO.sql.

-- 1. Columns and setting
alter table public.committee_areas add column if not exists backup_flats text[] not null default '{}';
update public.committee_areas set backup_flats = array[backup_flat]
 where backup_flat is not null and backup_flats = '{}' and backup_flat is distinct from holder_flat;
alter table public.app_settings add column if not exists area_backup_limit int not null default 4;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_area_backup_limit_check') then
    alter table public.app_settings add constraint app_settings_area_backup_limit_check check (area_backup_limit between 1 and 10);
  end if;
end $$;
alter table public.complaints add column if not exists backup_flats text[] not null default '{}';
update public.complaints set backup_flats = array[backup_flat] where backup_flat is not null and backup_flats = '{}';

-- 2. Who is who
create or replace function public.is_main_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_committee() and auth.uid() = (
    select u.id from auth.users u where u.raw_app_meta_data ->> 'role' = 'committee' order by u.created_at, u.id limit 1)
$$;
create or replace function public.can_assign_areas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_main_admin() or (public.is_committee() and exists (
    select 1 from public.flats f where f.id = public.my_flat() and f.is_committee
       and lower(trim(coalesce(f.committee_role, ''))) in ('chairman', 'secretary')))
$$;
-- what the screen should allow this login to do (the trigger below is what really decides)
create or replace function public.area_rights() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('manage', public.is_main_admin(), 'assign', public.can_assign_areas(),
    'limit', coalesce((select area_backup_limit from public.app_settings where id = 1), 4))
$$;
revoke all on function public.is_main_admin() from public, anon;
revoke all on function public.can_assign_areas() from public, anon;
revoke all on function public.area_rights() from public, anon;
grant execute on function public.is_main_admin() to authenticated;
grant execute on function public.can_assign_areas() to authenticated;
grant execute on function public.area_rights() to authenticated;

-- 3. Guard on every change of an area
create or replace function public.committee_areas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim int := coalesce((select area_backup_limit from public.app_settings where id = 1), 4);
  clean text[] := '{}'; b text; was text[] := '{}'; bad text;
  details_changed boolean; people_changed boolean;
begin
  -- tidy the list: no blanks, no repeats, order kept
  foreach b in array coalesce(new.backup_flats, '{}') loop
    b := nullif(trim(b), '');
    if b is not null and not (b = any (clean)) then clean := clean || b; end if;
  end loop;
  new.holder_flat := nullif(trim(coalesce(new.holder_flat, '')), '');
  -- an older screen that only sets backup_flat: treat it as the first backup
  if tg_op = 'UPDATE' and new.backup_flat is distinct from old.backup_flat and new.backup_flats is not distinct from old.backup_flats then
    clean := array_remove(array[nullif(trim(coalesce(new.backup_flat, '')), '')] || array_remove(clean, old.backup_flat), null);
  end if;
  new.backup_flats := clean;
  new.backup_flat := clean[1];

  if auth.uid() is null then return new; end if;   -- SQL Editor / server (restore): not checked

  if tg_op = 'INSERT' then
    details_changed := true;
    people_changed := new.holder_flat is not null or cardinality(clean) > 0;
  else
    details_changed := (new.name, new.description, new.sort, new.active, new.contact_phone)
                       is distinct from (old.name, old.description, old.sort, old.active, old.contact_phone);
    people_changed := new.holder_flat is distinct from old.holder_flat or new.backup_flats is distinct from old.backup_flats;
    was := array_remove(array[old.holder_flat] || coalesce(old.backup_flats, '{}'), null);
  end if;

  if details_changed and not public.is_main_admin() then
    raise exception 'Only the main admin login can add, rename, hide or reorder areas.';
  end if;
  if people_changed and not public.can_assign_areas() then
    raise exception 'Only the Chairman or the Secretary (from their own committee login) can choose the responsible member and backups.';
  end if;
  if people_changed then
    if new.holder_flat is not null and new.holder_flat = any (clean) then
      raise exception 'The responsible member cannot also be a backup for the same area.';
    end if;
    if cardinality(clean) > lim then raise exception 'At most % backups per area.', lim; end if;
    select string_agg(x, ', ') into bad from unnest(array_remove(array[new.holder_flat] || clean, null)) x
     where not (x = any (was)) and not exists (select 1 from public.flats f where f.id = x and f.is_committee);
    if bad is not null then raise exception 'Not on the committee: %. Mark them as committee members first.', bad; end if;
  end if;
  return new;
end $$;
revoke all on function public.committee_areas_guard() from public, anon, authenticated;
drop trigger if exists committee_areas_guard on public.committee_areas;
create trigger committee_areas_guard before insert or update on public.committee_areas for each row execute function public.committee_areas_guard();

-- 4. Rules: read as before; committee may add / change (the guard decides who); nobody deletes
drop policy if exists committee_all on public.committee_areas;
drop policy if exists committee_read on public.committee_areas;
drop policy if exists committee_add on public.committee_areas;
drop policy if exists committee_change on public.committee_areas;
create policy committee_read   on public.committee_areas for select to authenticated using (public.is_committee());
create policy committee_add    on public.committee_areas for insert to authenticated with check (public.is_committee());
create policy committee_change on public.committee_areas for update to authenticated using (public.is_committee()) with check (public.is_committee());
-- members_read (active areas for every login) stays as created by COMMITTEE_AMC.sql

-- 5. Complaints go to the responsible member and every backup
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
  select a.name, a.holder_flat, a.backup_flats[1], coalesce(a.backup_flats, '{}')
    into new.area_name, new.assigned_flat, new.backup_flat, new.backup_flats
    from public.committee_areas a where a.id = new.area_id;
  new.backup_flats := coalesce(new.backup_flats, '{}');
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
  if not (public.is_committee() or (public.my_flat() is not null and (public.my_flat() = c.assigned_flat or public.my_flat() = any (c.backup_flats) or public.my_flat() = c.backup_flat))) then
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
  update public.complaints set area_id = a.id, area_name = a.name, assigned_flat = a.holder_flat,
    backup_flat = a.backup_flats[1], backup_flats = coalesce(a.backup_flats, '{}'),
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

drop policy if exists flat_read on public.complaints;
create policy flat_read on public.complaints for select to authenticated
  using (public.my_flat() is not null and (public.my_flat() in (flat_id, assigned_flat, backup_flat) or public.my_flat() = any (backup_flats)));

-- Check (expected): backup lists column true • limit 4 • guard on true • area rules 4 • can delete areas false •
--                   complaints backup list true • areas with a backup copied = number of areas that had one
select 'backup lists column' as item, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'committee_areas' and column_name = 'backup_flats')::text as value
union all select 'backup limit', (select area_backup_limit::text from public.app_settings where id = 1)
union all select 'guard on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'committee_areas_guard' and not tgisinternal)::text
union all select 'area rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'committee_areas'
union all select 'can delete areas', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'committee_areas' and cmd in ('DELETE', 'ALL'))::text
union all select 'complaints backup list', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'complaints' and column_name = 'backup_flats')::text
union all select 'areas with backups', (select count(*) filter (where cardinality(backup_flats) > 0) || ' of ' || count(*) from public.committee_areas);
