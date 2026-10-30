-- 11 · Owner of a rented flat can see and fill the nominee form   (Aakar, decided 30 Oct 2026)
-- Until now (NOMINEES.sql) a flat login saw its nominees only while the flat was NOT rented, because before
-- 30 Oct 2026 a tenant used the flat's own login. Since TENANT_LOGINS.sql a tenant has a separate login
-- (role 'tenant', never flat_id), so my_flat() is always null for a tenant and the flat login is the owner's.
-- This script removes the "not rented" condition from the four flat-login rules on nominees / nomination_status.
-- Tenants still cannot see nominees: the rules need flat_id = my_flat(), which a tenant login never has.
-- Committee rules, the "signed form received" lock and the nominees_changed trigger are not touched.
--
-- BEFORE running: for every rented flat whose tenant was ever given the FLAT login (before tenant logins existed),
-- reset that flat login's password (ADMIN → Flat logins → Reset) and give it to the owner. Otherwise that tenant
-- could open the owner's nominee details.
-- Run in Supabase > SQL Editor. Safe to re-run. No data is changed. Undo: 11_UNDO.sql.

drop policy if exists owner_flat on public.nominees;
create policy owner_flat on public.nominees for all to authenticated
  using (flat_id = public.my_flat())
  with check (flat_id = public.my_flat());

drop policy if exists owner_flat_read on public.nomination_status;
create policy owner_flat_read on public.nomination_status for select to authenticated
  using (flat_id = public.my_flat());

drop policy if exists owner_flat_name on public.nomination_status;
create policy owner_flat_name on public.nomination_status for update to authenticated
  using (flat_id = public.my_flat())
  with check (flat_id = public.my_flat() and form_received = false);

drop policy if exists owner_flat_add on public.nomination_status;
create policy owner_flat_add on public.nomination_status for insert to authenticated
  with check (flat_id = public.my_flat() and form_received = false);

-- Check: 4 rows, each "rented check" = false and "own flat only" = true
select tablename, policyname,
  (coalesce(qual, '') || coalesce(with_check, '')) like '%flat_is_rented%' as rented_check,
  (coalesce(qual, '') || coalesce(with_check, '')) like '%my_flat()%' as own_flat_only
from pg_policies
where schemaname = 'public' and tablename in ('nominees', 'nomination_status')
  and policyname in ('owner_flat', 'owner_flat_read', 'owner_flat_name', 'owner_flat_add')
order by tablename, policyname;
