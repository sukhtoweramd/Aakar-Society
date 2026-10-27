-- Letter requests (26 Oct 2026): a member asks for a letter (NOC, address proof, no-dues…) from MY FLAT;
-- the committee sees the request in BILLING → LETTERS and issues the letter (or declines with a reason).
-- Run once in Supabase > SQL Editor, after LETTERS.sql. Safe to run again.
--
-- Who sees what: committee logins — every request; a flat login — its own requests only.
-- A flat can only ask and withdraw; issuing / declining is done by the committee.

create table if not exists public.letter_requests (
  id          uuid primary key default gen_random_uuid(),
  flat_id     text not null,
  letter_type text not null check (length(trim(letter_type)) between 2 and 120),
  addressee   text,                      -- blank = "To whomsoever it may concern"
  purpose     text check (purpose is null or length(purpose) <= 1000),
  status      text not null default 'requested' check (status in ('requested', 'issued', 'declined', 'withdrawn')),
  letter_id   uuid references public.letters(id) on delete set null,
  reason      text,                      -- why declined
  decided_by  text,
  decided_at  timestamptz,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists letter_requests_flat_idx on public.letter_requests (flat_id);
create index if not exists letter_requests_status_idx on public.letter_requests (status);

-- A new request always starts as "requested", whoever sends it.
create or replace function public.letter_request_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := 'requested'; new.letter_id := null; new.reason := null; new.decided_by := null; new.decided_at := null;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
drop trigger if exists letter_request_before_insert on public.letter_requests;
create trigger letter_request_before_insert before insert on public.letter_requests for each row execute function public.letter_request_before_insert();
revoke all on function public.letter_request_before_insert() from public, anon;

-- The member withdraws their own request while it is still waiting.
create or replace function public.withdraw_letter_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.letter_requests set status = 'withdrawn', decided_by = coalesce(auth.jwt() ->> 'email', public.my_flat()), decided_at = now(), updated_at = now()
   where id = p_id and status = 'requested' and (flat_id = public.my_flat() or public.is_committee());
  if not found then raise exception 'This request is not yours or is no longer waiting.'; end if;
end $$;
revoke all on function public.withdraw_letter_request(uuid) from public, anon;
grant execute on function public.withdraw_letter_request(uuid) to authenticated;

-- Rules
alter table public.letter_requests enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'letter_requests' loop
    execute format('drop policy %I on public.letter_requests', p.policyname);
  end loop;
end $$;
create policy committee_all on public.letter_requests for all to authenticated using (public.is_committee()) with check (public.is_committee());
create policy flat_read on public.letter_requests for select to authenticated using (public.my_flat() is not null and flat_id = public.my_flat());
create policy flat_ask on public.letter_requests for insert to authenticated with check (public.my_flat() is not null and flat_id = public.my_flat());

revoke all on public.letter_requests from anon;
grant select, insert, update, delete on public.letter_requests to authenticated, service_role;

-- Check: tables 1, rules 3, functions 2
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'letter_requests') as tables,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'letter_requests') as rules,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('letter_request_before_insert', 'withdraw_letter_request')) as functions;
