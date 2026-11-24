-- MT_05 (Nov 2026) - multi-tenant step 4c-1: numbers and names that must be unique PER SOCIETY, not across all societies.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_04. Try it on the test project ("aanganone") first; live Aakar only after that.
-- Safe to run again. Changes no data. Undo: MT_05_UNDO.sql (only possible while no two societies share a number).
--
-- What it changes (for Aakar nothing is different: every Aakar row already carries Aakar's society id):
--   1. "unique over the whole database" becomes "unique inside one society" for
--        bills.bill_no, payments.receipt_no, letters.ref_no, complaints.complaint_no,
--        booking_areas.name, letter_templates.name, flats.flat_no, flats.edit_code (edit_code is not read by any screen).
--      Existing rows are never touched. The rule only gets weaker across societies, so it cannot fail on existing data.
--   2. Two "one per flat" rules get the society in front: one active maintenance bill per flat and period,
--      and one active tenant login per flat (flat ids such as A101 repeat in every society).
--   3. Complaint numbers (CMP/26-27/0001 ...) are counted inside the society, so a new society starts at 0001.
--
-- NOT here (next scripts): the keys on flats / towers / nomination_status, the one-row settings tables, the society_id default.
-- Bill and receipt numbers come from billing_settings (one row today); they become per society together with that table (MT_06).

-- 1. Unique per society -----------------------------------------------------------------------------------------------------------
do $$
declare
  c record;
  i record;
  attn smallint;
  k int;
  t text;
  col text;
  pairs constant text[] := array['bills','bill_no', 'payments','receipt_no', 'letters','ref_no', 'complaints','complaint_no',
                                 'booking_areas','name', 'letter_templates','name', 'flats','flat_no', 'flats','edit_code'];
begin
  for k in 0 .. (array_length(pairs, 1) / 2) - 1 loop
    t := pairs[2 * k + 1];
    col := pairs[2 * k + 2];
    if to_regclass('public.' || t) is null then continue; end if;
    select a.attnum into attn from pg_attribute a
      where a.attrelid = ('public.' || t)::regclass and a.attname = col and not a.attisdropped;
    if attn is null then continue; end if;
    -- the old rule(s) on this one column: named constraints first, then a stand-alone unique index
    for c in select con.conname from pg_constraint con
             where con.conrelid = ('public.' || t)::regclass and con.contype = 'u' and con.conkey = array[attn] loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    for i in select ic.relname from pg_index ix join pg_class ic on ic.oid = ix.indexrelid
             where ix.indrelid = ('public.' || t)::regclass and ix.indisunique and not ix.indisprimary
               and ix.indnatts = 1 and ix.indkey[0] = attn and ix.indpred is null
               and not exists (select 1 from pg_constraint c2 where c2.conindid = ix.indexrelid) loop
      execute format('drop index public.%I', i.relname);
    end loop;
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = t || '_' || col || '_society_key') then
      execute format('alter table public.%I add constraint %I unique (society_id, %I)', t, t || '_' || col || '_society_key', col);
    end if;
  end loop;
end $$;

-- 2. "One per flat" rules with the society in front (only where the old rule exists) -------------------------------------------------
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'bills_one_maintenance_per_period') then
    drop index public.bills_one_maintenance_per_period;
    create unique index bills_one_maintenance_per_period on public.bills (society_id, flat_id, period_from)
      where kind = 'maintenance' and status = 'active';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'flat_tenant_logins_one_active') then
    drop index public.flat_tenant_logins_one_active;
    create unique index flat_tenant_logins_one_active on public.flat_tenant_logins (society_id, flat_id) where active;
  end if;
end $$;

-- 3. Complaint numbers counted inside the society (same text as COMPLAINTS.sql, plus the society filter and a lock per society) ------
create or replace function public.complaint_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; y int; fy text; n int;
begin
  y := extract(year from d)::int;
  if extract(month from d) < 4 then y := y - 1; end if;
  fy := lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  perform pg_advisory_xact_lock(hashtext('complaint_no_' || fy || '_' || new.society_id::text));
  select coalesce(max((substring(c.complaint_no from '(\d+)$'))::int), 0) + 1 into n
    from public.complaints c where c.society_id = new.society_id and c.complaint_no like 'CMP/' || fy || '/%';
  new.complaint_no := 'CMP/' || fy || '/' || lpad(n::text, 4, '0');
  select a.name, a.holder_flat, a.backup_flat into new.area_name, new.assigned_flat, new.backup_flat
    from public.committee_areas a where a.id = new.area_id;
  new.status := 'open'; new.progress_note := null; new.close_note := null; new.closed_at := null; new.closed_by := null;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  new.created_at := now(); new.updated_at := now();
  new.history := jsonb_build_array(jsonb_build_object('at', now(), 'by', new.created_by, 'status', 'open', 'note', 'raised'));
  return new;
end $$;

-- 4. Check ---------------------------------------------------------------------------------------------------------------------------
with want(t, col) as (values ('bills','bill_no'), ('payments','receipt_no'), ('letters','ref_no'), ('complaints','complaint_no'),
                             ('booking_areas','name'), ('letter_templates','name'), ('flats','flat_no'), ('flats','edit_code')),
present as (select w.t, w.col from want w
            where to_regclass('public.' || w.t) is not null
              and exists (select 1 from pg_attribute a where a.attrelid = ('public.' || w.t)::regclass and a.attname = w.col and not a.attisdropped)),
per_society as (select p.t, p.col from present p
                where exists (select 1 from pg_constraint con
                              where con.conrelid = ('public.' || p.t)::regclass and con.contype = 'u' and con.conname = p.t || '_' || p.col || '_society_key')),
still_global as (select p.t, p.col from present p
                 where exists (select 1 from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
                               where con.conrelid = ('public.' || p.t)::regclass and con.contype = 'u'
                                 and array_length(con.conkey, 1) = 1 and a.attname = p.col))
select 'rules now per society (expect ' || (select count(*) from present) || ')' as what, (select count(*)::text from per_society) as value
union all select 'rules still over all societies (expect none)', coalesce((select string_agg(t || '.' || col, ', ') from still_global), 'none')
union all select 'maintenance-bill and tenant-login rules with the society in front (expect the same number as rules that exist)',
  (select count(*)::text from pg_indexes where schemaname = 'public' and indexname in ('bills_one_maintenance_per_period', 'flat_tenant_logins_one_active') and indexdef like '%society_id%')
  || ' of ' || (select count(*)::text from pg_indexes where schemaname = 'public' and indexname in ('bills_one_maintenance_per_period', 'flat_tenant_logins_one_active'))
union all select 'complaint numbering counts inside the society (expect yes)',
  case when exists (select 1 from pg_proc where proname = 'complaint_before_insert' and pronamespace = 'public'::regnamespace and prosrc like '%c.society_id = new.society_id%') then 'yes' else 'NO' end
union all select 'other unique rules without society_id, for me to review (not an error)',
  coalesce((select string_agg(i.tablename || '.' || i.indexname, ', ' order by i.tablename, i.indexname)
            from pg_indexes i
            where i.schemaname = 'public' and i.indexdef like 'CREATE UNIQUE INDEX%' and i.indexdef not like '%society_id%'
              and i.indexname not like '%\_pkey' and i.tablename in (select table_name from information_schema.columns where table_schema = 'public' and column_name = 'society_id')), 'none');
