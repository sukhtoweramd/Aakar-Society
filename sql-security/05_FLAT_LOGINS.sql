-- 05 · Before flat logins are handed out   (Aakar security fixes, audit M4 / M5 / L4, Oct 2026)
-- Run in Supabase > SQL Editor after the matching app update is live. Safe to re-run. No data is changed.
-- Undo: 05_UNDO.sql (everything exactly as before).
--
-- 1. M4 — what a flat login may change in its own flat row ("fill once", decided 27 Oct 2026)
--    The committee can still change everything. A flat login:
--      • may change at any time: owner mobile, owner's present address, email, tenant "living here from",
--        rent agreement end date, directory sharing (consent)
--      • may FILL IN an empty owner name / tenant name; once filled, only the committee changes it
--        (the owner name is printed on bills and NOC letters)
--      • may not change anything else, including owner / tenant ("who lives here") and any column added later
--    A rented flat's login still cannot change the owner's name, mobile, address or email (as before).
-- 2. M5 — booking approval: only a COMMITTEE login (email) linked to the flat whose designation is exactly
--    "Chairman" or "Secretary". The flat login of that flat (used by family / tenant) no longer approves.
--    "Vice Chairman", "Joint Secretary" etc. no longer match. If no flat is marked Chairman / Secretary,
--    any committee login may approve (as before).
-- 3. L4 — an "I have paid" report from a flat can only point at a bill of that same flat.
-- 4. Tidy-up: my_flat() can no longer be called without a login.

-- 1. Flat row guard: allow-list
create or replace function public.flats_resident_guard() returns trigger
language plpgsql as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  free text[] := array['email', 'owner_mobile', 'owner_address', 'tenant_from', 'agreement_until',
                       'directory_consent', 'directory_consent_at', 'directory_consent_by', 'updated_at'];
  once text[] := array['owner_name', 'tenant_name'];
  c text;
  what text;
begin
  if public.is_committee() then return new; end if;
  if old.occupancy = 'tenant' then            -- rented: the owner's details are the committee's
    free := array['tenant_from', 'agreement_until', 'directory_consent', 'directory_consent_at', 'directory_consent_by', 'updated_at'];
    once := array['tenant_name'];
  end if;
  for c in select jsonb_object_keys(n) loop
    if c = any(free) or (n -> c) is not distinct from (o -> c) then continue; end if;
    what := case c when 'owner_name' then 'The owner''s name' when 'tenant_name' then 'The tenant''s name'
                   when 'occupancy' then 'Who lives in the flat (owner / tenant)'
                   when 'email' then 'The owner''s email' when 'owner_mobile' then 'The owner''s mobile'
                   when 'owner_address' then 'The owner''s address'
                   else initcap(replace(c, '_', ' ')) end;
    if c = any(once) then
      if nullif(trim(coalesce(o ->> c, '')), '') is null then continue; end if;   -- empty: the member may fill it in
      raise exception '% is already filled in. Only the committee can change it.', what;
    end if;
    raise exception '% can be changed only by the committee.', what;
  end loop;
  return new;
end $$;
drop trigger if exists flats_resident_guard on public.flats;
create trigger flats_resident_guard before update on public.flats for each row execute function public.flats_resident_guard();

-- 2. Booking approval
create or replace function public.can_approve_booking() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_committee() and (
       exists (select 1 from public.flats f
                where f.id = public.my_flat() and f.is_committee
                  and lower(trim(coalesce(f.committee_role, ''))) in ('chairman', 'secretary'))
    or not exists (select 1 from public.flats f
                    where f.is_committee and lower(trim(coalesce(f.committee_role, ''))) in ('chairman', 'secretary')))
$$;
revoke all on function public.can_approve_booking() from public, anon;
grant execute on function public.can_approve_booking() to authenticated;

-- 3. "I have paid": the bill must be the flat's own
drop policy if exists resident_add on public.payment_reports;
create policy resident_add on public.payment_reports for insert to authenticated
  with check (flat_id = public.my_flat() and status = 'pending' and payment_id is null and reviewed_by is null and verified_amount is null
              and (bill_id is null or exists (select 1 from public.bills b where b.id = bill_id and b.flat_id = public.my_flat())));

-- 4. my_flat(): logged-in users only (the database rules call it for them)
revoke all on function public.my_flat() from public, anon;
grant execute on function public.my_flat() to authenticated, service_role;

-- Check: every row should be true
select 'flat guard is fill-once' as item, (pg_get_functiondef('public.flats_resident_guard()'::regprocedure) like '%already filled in%')::text as value
union all select 'flat guard trigger on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'flats_resident_guard' and not tgisinternal)::text
union all select 'booking approval exact + committee login', (pg_get_functiondef('public.can_approve_booking()'::regprocedure) like '%in (''chairman'', ''secretary'')%')::text
union all select 'paid report: own bill only', (select bool_or(with_check like '%bills%') from pg_policies where schemaname = 'public' and tablename = 'payment_reports' and policyname = 'resident_add')::text
union all select 'my_flat closed to anon', (not has_function_privilege('anon', 'public.my_flat()', 'execute'))::text
union all select 'my_flat open to members', has_function_privilege('authenticated', 'public.my_flat()', 'execute')::text;
