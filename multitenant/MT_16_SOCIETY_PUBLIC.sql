-- MT_16 (Nov 2026) - society-choice login, step 1: two small read-only functions. Run by hand in the Supabase SQL Editor, AFTER MT_01 / MT_03.
-- Try it on the test project ("aanganone") first. Safe to run again. Changes no table and no data. Undo: MT_16_UNDO.sql.
--   society_public(p_word)  - for the LOGIN PAGE (before anyone is logged in, so anon may call it): gives the society's name and word for an ACTIVE
--                             society, or nothing. Nothing else is returned (no id, no counts, no data). A society that is paused / closed, or a word that
--                             does not exist, gives the same answer: null.
--   my_society()            - for a logged-in login: the word and name of ITS society (active_society()), or null when it has none yet. The app uses it
--                             to tell a member who opened another society's address that this login belongs elsewhere.
-- Exposure: someone can ask "is there a society with this word?" and learn its public name. That is the same as opening its address.

create or replace function public.society_public(p_word text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', s.slug, 'name', s.name)
    from public.societies s
   where s.slug = lower(trim(coalesce(p_word, ''))) and s.status = 'active'
$$;
revoke all on function public.society_public(text) from public;
grant execute on function public.society_public(text) to anon, authenticated, service_role;

create or replace function public.my_society() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', s.slug, 'name', s.name)
    from public.societies s
   where s.id = (select public.active_society())
$$;
revoke all on function public.my_society() from public, anon;
grant execute on function public.my_society() to authenticated, service_role;

-- Check
select 'society_public finds the first society (expect aakar)' as what, coalesce(public.society_public('aakar') ->> 'slug', 'NO') as value
union all select 'society_public: unknown word gives nothing (expect nothing)', coalesce(public.society_public('no-such-word-zz') ->> 'slug', 'nothing')
union all select 'anon may call society_public, not my_society (expect true / false)',
       has_function_privilege('anon', 'public.society_public(text)', 'execute')::text || ' / ' || has_function_privilege('anon', 'public.my_society()', 'execute')::text;
