-- Committee member who is not the owner (28 Oct 2026): the committee flag and designation stay on the flat (logins,
-- booking approval and committee areas use them), and the flat also records WHICH PERSON of the family is the
-- committee member. Committee lists, directory, minutes, areas and "who to contact" show that person's name.
-- Empty = the owner, as before. Only the committee can set it (the flat rules of sql-security/05 already lock new columns).
-- Run once in Supabase > SQL Editor. Safe to re-run. Does not change existing data.

alter table public.flats add column if not exists committee_person text;

-- Every login may see who is on the committee (names and designations only), as in the committee directory
create or replace function public.committee_people()
returns table (flat_id text, committee_role text, person text)
language sql stable security definer set search_path = public as $$
  select f.id, f.committee_role, coalesce(nullif(trim(f.committee_person), ''), f.owner_name)
    from public.flats f where f.is_committee
$$;
revoke all on function public.committee_people() from public, anon;
grant execute on function public.committee_people() to authenticated;

-- Check: should show column 1, function 1
select 'column' as item, count(*)::text as value from information_schema.columns where table_schema = 'public' and table_name = 'flats' and column_name = 'committee_person'
union all select 'function', count(*)::text from pg_proc where proname = 'committee_people';
