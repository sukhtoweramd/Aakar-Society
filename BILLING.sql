-- Billing: bills, payments (receipts), numbering, bank details, signatories and stamp.
-- Run once in Supabase > SQL Editor (after PRE_PHASE2_A.sql). Safe to run again.

-- 1. Settings (one row): numbering, due days, bank details, default signers, stamp
create table if not exists public.billing_settings (
  id int primary key default 1 check (id = 1),
  bill_prefix text not null default 'AKR/26-27/',
  bill_last_no int not null default 0,
  other_prefix text not null default 'AKR/O/26-27/',
  other_last_no int not null default 0,
  rcpt_prefix text not null default 'AKR/R/26-27/',
  rcpt_last_no int not null default 0,
  num_digits int not null default 4,
  due_days int not null default 30,
  account_name text, bank_name text, bank_branch text, account_no text, ifsc text, upi_id text,
  cheque_payee text, pay_note text,
  bill_signer uuid, rcpt_signer uuid,
  stamp_image text,                 -- PNG data URL (transparent); empty = built-in blue stamp
  updated_by text, updated_at timestamptz default now()
);
insert into public.billing_settings (id) values (1) on conflict (id) do nothing;

-- 2. Authorised signatories (signature kept as a small transparent PNG)
create table if not exists public.signatories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text not null,
  signature_image text,             -- PNG data URL
  active boolean not null default true,
  created_by text, created_at timestamptz not null default now()
);

-- 3. Bills (maintenance and one-off)
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique,
  flat_id text not null references public.flats(id),
  kind text not null default 'maintenance' check (kind in ('maintenance', 'other')),
  bill_to text,
  bill_date date not null,
  due_date date,
  period_from date, period_to date,
  lines jsonb not null default '[]',   -- [{description, rate, qty, amount}]
  amount numeric(12,2) not null check (amount >= 0),
  signer_id uuid, signer_name text, signer_designation text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text, cancelled_by text, cancelled_at timestamptz,
  created_by text, created_at timestamptz not null default now()
);
create index if not exists bills_flat_idx on public.bills(flat_id);

-- 4. Payments = receipts (one receipt per payment; several can be against one bill)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  bill_id uuid not null references public.bills(id),
  flat_id text not null references public.flats(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null,
  mode text not null check (mode in ('Cheque', 'NEFT', 'IMPS', 'UPI', 'Cash', 'Other')),
  bank text, ref text,
  received_from text,
  signer_id uuid, signer_name text, signer_designation text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text, cancelled_by text, cancelled_at timestamptz,
  created_by text, created_at timestamptz not null default now()
);
create index if not exists payments_flat_idx on public.payments(flat_id);
create index if not exists payments_bill_idx on public.payments(bill_id);

-- 5. Access: committee everything; a flat login reads only its own bills and receipts;
--    everyone logged in can read settings (bank details on bills) and signatories (printed on bills)
do $$
declare t text; p record;
begin
  foreach t in array array['billing_settings','signatories','bills','payments'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy resident_read on public.billing_settings for select to authenticated using (true);
create policy resident_read on public.signatories      for select to authenticated using (true);
create policy resident_own  on public.bills            for select to authenticated using (flat_id = public.my_flat());
create policy resident_own  on public.payments         for select to authenticated using (flat_id = public.my_flat());

-- 6. Numbers: reserve the next N numbers of a series in one step (no two people get the same number)
create or replace function public.next_doc_numbers(p_series text, p_count int default 1)
returns table(prefix text, first_no int, digits int)
language plpgsql security definer set search_path = public as $$
declare s public.billing_settings;
begin
  if not public.is_committee() then raise exception 'Committee only'; end if;
  if p_count < 1 or p_count > 500 then raise exception 'Bad count'; end if;
  if p_series = 'bill' then
    update public.billing_settings set bill_last_no = bill_last_no + p_count where id = 1 returning * into s;
    return query select s.bill_prefix, s.bill_last_no - p_count + 1, s.num_digits;
  elsif p_series = 'other' then
    update public.billing_settings set other_last_no = other_last_no + p_count where id = 1 returning * into s;
    return query select s.other_prefix, s.other_last_no - p_count + 1, s.num_digits;
  elsif p_series = 'receipt' then
    update public.billing_settings set rcpt_last_no = rcpt_last_no + p_count where id = 1 returning * into s;
    return query select s.rcpt_prefix, s.rcpt_last_no - p_count + 1, s.num_digits;
  else raise exception 'Unknown series %', p_series; end if;
end $$;
revoke all on function public.next_doc_numbers(text, int) from public, anon;
grant execute on function public.next_doc_numbers(text, int) to authenticated;

-- 7. Check: four tables with their rules
select tablename, count(*) as rules from pg_policies
where schemaname = 'public' and tablename in ('billing_settings','signatories','bills','payments')
group by tablename order by tablename;
