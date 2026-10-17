-- Letters issued to flats (NOC, "to whomsoever it may concern", etc.)
-- Run once in Supabase > SQL Editor (after BILLING.sql). Safe to run again. Does NOT change existing data.

-- 1. Letter number series (like bills and receipts)
alter table public.billing_settings add column if not exists letter_prefix text not null default 'AKR/L/26-27/';
alter table public.billing_settings add column if not exists letter_last_no int not null default 0;

-- 2. Letters
create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  flat_id text not null references public.flats(id),
  letter_date date not null,
  owner_name text,                                   -- as on the letter (snapshot)
  addressee text not null default 'TO WHOMSOEVER IT MAY CONCERN',
  subject text not null,
  body text not null,
  signer_id uuid, signer_name text, signer_designation text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_reason text, cancelled_by text, cancelled_at timestamptz,
  created_by text, created_at timestamptz not null default now()
);
create index if not exists letters_flat_idx on public.letters(flat_id);

-- 3. Access: committee everything; a flat login reads only its own letters
alter table public.letters enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'letters' loop
    execute format('drop policy %I on public.letters', p.policyname);
  end loop;
end $$;
create policy committee_all on public.letters for all to authenticated using (public.is_committee()) with check (public.is_committee());
create policy resident_own on public.letters for select to authenticated using (flat_id = public.my_flat());
revoke all on public.letters from anon;

-- 4. Numbers: add the 'letter' series to the existing number function
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
  elsif p_series = 'letter' then
    update public.billing_settings set letter_last_no = letter_last_no + p_count where id = 1 returning * into s;
    return query select s.letter_prefix, s.letter_last_no - p_count + 1, s.num_digits;
  else raise exception 'Unknown series %', p_series; end if;
end $$;
revoke all on function public.next_doc_numbers(text, int) from public, anon;
grant execute on function public.next_doc_numbers(text, int) to authenticated;

-- 5. Check: letters with 2 rules, and the letter number column
select 'letters' as item, count(*)::text as value from pg_policies where schemaname = 'public' and tablename = 'letters'
union all
select 'letter_prefix', letter_prefix from public.billing_settings where id = 1;
