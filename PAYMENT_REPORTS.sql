-- "I have paid": members report a payment; the committee verifies it and the receipt is made.
-- Run once in Supabase > SQL Editor (after BILLING.sql and BACKUP_RESTORE.sql). Safe to run again. Does NOT change existing data.

-- 1. Reported payments
create table if not exists public.payment_reports (
  id uuid primary key default gen_random_uuid(),
  flat_id text not null references public.flats(id),
  bill_id uuid references public.bills(id) on delete cascade,     -- the bill the member is paying
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null,
  mode text not null check (mode in ('Cheque', 'NEFT', 'IMPS', 'UPI', 'Cash', 'Other')),
  bank text, ref text, note text,
  proof_key text,                                                  -- screenshot in file storage (secret name, served only after a login check)
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_amount numeric(12,2),
  payment_id uuid references public.payments(id) on delete set null, -- the receipt made on verifying
  reject_reason text,
  reported_by text default (auth.jwt() ->> 'email'),
  reported_at timestamptz not null default now(),
  reviewed_by text, reviewed_at timestamptz
);
create index if not exists payment_reports_flat_idx on public.payment_reports(flat_id);
create index if not exists payment_reports_status_idx on public.payment_reports(status);

-- 2. Access: committee everything; a flat sees its own reports, can add new ones (always 'pending') and withdraw a pending one
alter table public.payment_reports enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'payment_reports' loop
    execute format('drop policy %I on public.payment_reports', p.policyname);
  end loop;
end $$;
create policy committee_all on public.payment_reports for all to authenticated using (public.is_committee()) with check (public.is_committee());
create policy resident_read on public.payment_reports for select to authenticated using (flat_id = public.my_flat());
create policy resident_add on public.payment_reports for insert to authenticated
  with check (flat_id = public.my_flat() and status = 'pending' and payment_id is null and reviewed_by is null and verified_amount is null);
create policy resident_withdraw on public.payment_reports for delete to authenticated using (flat_id = public.my_flat() and status = 'pending');
revoke all on public.payment_reports from anon;

-- 3. Verify: makes the receipt and marks the report verified, in one step (committee only).
--    The committee can move it to another bill of the same flat. Refuses if already handled, or if the amount is more than the bill's balance.
drop function if exists public.verify_payment_report(uuid, numeric, uuid);
create or replace function public.verify_payment_report(p_id uuid, p_amount numeric, p_signer uuid default null, p_bill uuid default null)
returns text language plpgsql set search_path = public as $$
declare r public.payment_reports; b public.bills; bal numeric; n record; rno text; sg public.signatories; pid uuid;
begin
  if not public.is_committee() then raise exception 'Committee only'; end if;
  select * into r from public.payment_reports where id = p_id for update;
  if not found then raise exception 'Report not found'; end if;
  if r.status <> 'pending' then raise exception 'This payment was already %.', r.status; end if;
  if p_bill is not null and p_bill is distinct from r.bill_id then
    if not exists (select 1 from public.bills where id = p_bill and flat_id = r.flat_id) then raise exception 'That bill is not for this flat.'; end if;
    update public.payment_reports set bill_id = p_bill where id = p_id; r.bill_id := p_bill;
  end if;
  if r.bill_id is null then raise exception 'Choose the bill this payment is for.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount received.'; end if;
  select * into b from public.bills where id = r.bill_id;
  if b.status <> 'active' then raise exception 'Bill % is cancelled.', b.bill_no; end if;
  select b.amount - coalesce(sum(amount), 0) into bal from public.payments where bill_id = b.id and status = 'active';
  if p_amount > bal + 0.001 then raise exception 'Rs % is more than the Rs % due on bill %.', p_amount, bal, b.bill_no; end if;
  select * into n from public.next_doc_numbers('receipt', 1);
  rno := n.prefix || lpad(n.first_no::text, n.digits, '0');
  if p_signer is not null then select * into sg from public.signatories where id = p_signer; end if;
  insert into public.payments (receipt_no, bill_id, flat_id, amount, paid_on, mode, bank, ref, received_from, signer_id, signer_name, signer_designation, created_by)
  values (rno, b.id, b.flat_id, p_amount, r.paid_on, r.mode, r.bank, r.ref, b.bill_to, sg.id, sg.name, sg.designation, auth.jwt() ->> 'email')
  returning id into pid;
  update public.payment_reports set status = 'verified', verified_amount = p_amount, payment_id = pid,
    reviewed_by = auth.jwt() ->> 'email', reviewed_at = now() where id = p_id;
  return rno;
end $$;
revoke all on function public.verify_payment_report(uuid, numeric, uuid, uuid) from public, anon;
grant execute on function public.verify_payment_report(uuid, numeric, uuid, uuid) to authenticated;

-- 4. Backups and restore include reported payments
create or replace function public.restore_society_backup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ins text[] := array['flats','billing_settings','signatories','events','notices','maintenance','businesses',
                      'members','emergency_contacts','vehicles','flat_docs','bills','payments','letters','payment_reports'];
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

-- 5. Check: payment_reports with 4 rules, and the verify function
select 'payment_reports rules' as item, count(*)::text as value from pg_policies where schemaname = 'public' and tablename = 'payment_reports'
union all
select 'verify_payment_report', count(*)::text from pg_proc where proname = 'verify_payment_report';
