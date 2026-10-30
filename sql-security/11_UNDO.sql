-- 11 UNDO · Back to the NOMINEES.sql rules: a flat login sees its nominees only while the flat is NOT rented.
-- No data is changed. Safe to re-run.

drop policy if exists owner_flat on public.nominees;
create policy owner_flat on public.nominees for all to authenticated
  using (flat_id = public.my_flat() and not public.flat_is_rented(flat_id))
  with check (flat_id = public.my_flat() and not public.flat_is_rented(flat_id));

drop policy if exists owner_flat_read on public.nomination_status;
create policy owner_flat_read on public.nomination_status for select to authenticated
  using (flat_id = public.my_flat() and not public.flat_is_rented(flat_id));

drop policy if exists owner_flat_name on public.nomination_status;
create policy owner_flat_name on public.nomination_status for update to authenticated
  using (flat_id = public.my_flat() and not public.flat_is_rented(flat_id))
  with check (flat_id = public.my_flat() and not public.flat_is_rented(flat_id) and form_received = false);

drop policy if exists owner_flat_add on public.nomination_status;
create policy owner_flat_add on public.nomination_status for insert to authenticated
  with check (flat_id = public.my_flat() and not public.flat_is_rented(flat_id) and form_received = false);

-- Check: 4 rows, each "rented check" = true
select tablename, policyname,
  (coalesce(qual, '') || coalesce(with_check, '')) like '%flat_is_rented%' as rented_check
from pg_policies
where schemaname = 'public' and tablename in ('nominees', 'nomination_status')
  and policyname in ('owner_flat', 'owner_flat_read', 'owner_flat_name', 'owner_flat_add')
order by tablename, policyname;
