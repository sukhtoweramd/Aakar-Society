-- Gives ONE society that was made before 27 Nov 2026 its missing one-row settings
-- (app_settings + billing_settings with ITS OWN number prefixes, not Aakar's AKR/).
-- Safe to run again: rows that already exist are left alone. Run in the SQL Editor of the database that holds the society.
-- 1) Change the two values in the first block (society word = the address word, code = 2-3 letters for bill numbers).
-- NEVER use this for Aakar (it already has its rows).
do $$
declare
  v_word text := 'test-park';   -- <- society word (societies.slug)
  v_code text := 'TP';          -- <- letters for bill / receipt / letter numbers
  v_fy   text := '26-27';       -- <- financial year of the numbers
  v_id   uuid;
begin
  select id into v_id from public.societies where slug = v_word;
  if v_id is null then raise exception 'No society with word %', v_word; end if;
  if v_id = 'a4a4a4a4-0000-4000-8000-000000000001' then raise exception 'This is the first society (Aakar); it already has its settings'; end if;

  insert into public.app_settings (society_id, id) values (v_id, 1) on conflict do nothing;
  insert into public.billing_settings (society_id, id, bill_prefix, other_prefix, rcpt_prefix, letter_prefix)
  values (v_id, 1, v_code||'/'||v_fy||'/', v_code||'/O/'||v_fy||'/', v_code||'/R/'||v_fy||'/', v_code||'/L/'||v_fy||'/')
  on conflict do nothing;
end $$;

-- Check: both rows exist for the society and no AKR/ prefix is on it.
select s.slug, (select count(*) from public.app_settings a where a.society_id = s.id) as app_settings_rows,
       b.bill_prefix, b.other_prefix, b.rcpt_prefix, b.letter_prefix
from public.societies s left join public.billing_settings b on b.society_id = s.id
where s.slug = 'test-park';
