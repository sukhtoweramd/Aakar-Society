-- Nominees (item 22, 25 Oct 2026): each member (flat owner) names one or more nominees with a share %.
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- Only the LAST 4 DIGITS of Aadhaar are kept (decided 25 Oct 2026); the full number is written by hand on the
-- signed paper form. The database refuses anything other than 4 digits.
-- Who sees what:
--   * committee logins: every flat; can mark "signed form received"
--   * a flat login: its own nominees — but NOT when the flat is rented out (the tenant must not see the owner's
--     nominees; the committee enters them for the owner)
--   (Changed 30 Oct 2026 by sql-security/11_NOMINEE_RENTED_OWNER.sql: the flat login now sees its nominees also when
--    rented, because tenants have their own logins. Re-running this script puts the old rule back; run 11 again after.)

create table if not exists public.nominees (
  id                uuid primary key default gen_random_uuid(),
  flat_id           text not null,
  name              text not null check (length(trim(name)) between 2 and 120),
  relation          text not null check (length(trim(relation)) between 2 and 60),
  dob               date not null check (dob > date '1900-01-01' and dob <= current_date),
  aadhaar_last4     text check (aadhaar_last4 ~ '^[0-9]{4}$'),
  pan               text check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  share_pct         numeric(5,2) not null default 100 check (share_pct > 0 and share_pct <= 100),
  mobile            text,
  address           text,
  guardian_name     text,               -- needed when the nominee is under 18
  guardian_relation text,
  sort              int not null default 1,
  updated_by        text,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists nominees_flat_idx on public.nominees (flat_id);

-- One row per flat: when the nomination was last changed, and whether the signed paper form reached the society.
create table if not exists public.nomination_status (
  flat_id         text primary key,
  member_name     text,                -- the member making the nomination (owner)
  declared_at     timestamptz,
  declared_by     text,
  form_received   boolean not null default false,
  received_at     timestamptz,
  received_by     text,
  updated_at      timestamptz not null default now()
);

-- Any change to a flat's nominees: mark the nomination as changed, and the signed form as not yet received
-- (a new paper form is needed for the new details).
create or replace function public.nominees_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid text := coalesce(new.flat_id, old.flat_id); who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'unknown');
begin
  insert into public.nomination_status (flat_id, declared_at, declared_by, form_received, received_at, received_by, updated_at)
  values (fid, now(), who, false, null, null, now())
  on conflict (flat_id) do update set declared_at = now(), declared_by = who, form_received = false, received_at = null, received_by = null, updated_at = now();
  return null;
end $$;
drop trigger if exists nominees_changed on public.nominees;
create trigger nominees_changed after insert or update or delete on public.nominees for each row execute function public.nominees_changed();
revoke all on function public.nominees_changed() from public, anon;

-- Is this flat rented out? (tenants may not read or change the owner's nominees)
create or replace function public.flat_is_rented(p_flat text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.occupancy = 'tenant' from public.flats f where f.id = p_flat), false)
$$;
revoke all on function public.flat_is_rented(text) from public, anon;
grant execute on function public.flat_is_rented(text) to authenticated;

-- Rules
alter table public.nominees enable row level security;
alter table public.nomination_status enable row level security;
do $$ declare t text; p record; begin
  foreach t in array array['nominees', 'nomination_status'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy committee_all on public.%I for all to authenticated using (public.is_committee()) with check (public.is_committee())', t);
  end loop;
end $$;
create policy owner_flat on public.nominees for all to authenticated
  using (flat_id = public.my_flat() and not public.flat_is_rented(flat_id))
  with check (flat_id = public.my_flat() and not public.flat_is_rented(flat_id));
create policy owner_flat_read on public.nomination_status for select to authenticated
  using (flat_id = public.my_flat() and not public.flat_is_rented(flat_id));
create policy owner_flat_name on public.nomination_status for update to authenticated
  using (flat_id = public.my_flat() and not public.flat_is_rented(flat_id))
  with check (flat_id = public.my_flat() and not public.flat_is_rented(flat_id) and form_received = false);
create policy owner_flat_add on public.nomination_status for insert to authenticated
  with check (flat_id = public.my_flat() and not public.flat_is_rented(flat_id) and form_received = false);

revoke all on public.nominees, public.nomination_status from anon;
grant select, insert, update, delete on public.nominees, public.nomination_status to authenticated, service_role;

-- Check: tables 2, rules 6, functions 2
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('nominees', 'nomination_status')) as tables,
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('nominees', 'nomination_status')) as rules,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('nominees_changed', 'flat_is_rented')) as functions;
