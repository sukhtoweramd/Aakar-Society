-- Undo of MT_05_PER_SOCIETY_UNIQUE.sql: numbers and names are unique over ALL societies again.
-- Only works while no two societies share a number or name (with one society, as today, that is always true).
-- If it stops with "could not create unique index ... duplicate key", a second society already uses the same number: leave MT_05 in place.
do $$
declare
  k int;
  t text;
  col text;
  pairs constant text[] := array['bills','bill_no', 'payments','receipt_no', 'letters','ref_no', 'complaints','complaint_no',
                                 'booking_areas','name', 'letter_templates','name', 'flats','flat_no', 'flats','edit_code'];
  old_name text;
begin
  for k in 0 .. (array_length(pairs, 1) / 2) - 1 loop
    t := pairs[2 * k + 1];
    col := pairs[2 * k + 2];
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_' || col || '_society_key');
    old_name := t || '_' || col || '_key';
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = old_name) then
      execute format('alter table public.%I add constraint %I unique (%I)', t, old_name, col);
    end if;
  end loop;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bills_one_maintenance_per_period') then
    drop index public.bills_one_maintenance_per_period;
    create unique index bills_one_maintenance_per_period on public.bills (flat_id, period_from) where kind = 'maintenance' and status = 'active';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'flat_tenant_logins_one_active') then
    drop index public.flat_tenant_logins_one_active;
    create unique index flat_tenant_logins_one_active on public.flat_tenant_logins (flat_id) where active;
  end if;
end $$;

-- the complaint-number trigger as in COMPLAINTS.sql (counts over all societies)
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

select 'rules per society left (expect 0)' as what, count(*)::text as value from pg_constraint where conname like '%\_society\_key' and conrelid::regclass::text in
  ('bills','payments','letters','complaints','booking_areas','letter_templates','flats');
