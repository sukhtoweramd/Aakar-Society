-- MT_19 (27 Nov 2026) - a logo for every society. Run by hand in the Supabase SQL Editor, AFTER MT_16. Try it on the test project ("aanganone") first,
-- live after a fresh backup. Safe to run again. Undo: MT_19_UNDO.sql.
--   1. society_profile.logo_image  - a small square picture kept as text (a data URL, PNG / JPEG / WEBP). The app squeezes it to about 60 000
--      characters before saving; the database refuses anything over 120 000 (society_profile_logo_size). Who may change it is already decided by
--      the table rules of society_profile (the society owner, is_main_admin()); nothing new to grant. Backup / restore carry the column by themselves
--      (they copy whole rows).
--   2. society_public(p_word)      - the login page's function (anon) now also returns the logo, but only when the society has one
--      (so the answer is still just slug + name for a society without a logo). The login page can then show the society's own logo before login.
-- Exposure: the logo is the society's public face, the same as its name; it appears only for an ACTIVE society whose word is asked for.

alter table public.society_profile add column if not exists logo_image text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'society_profile_logo_size' and conrelid = 'public.society_profile'::regclass) then
    alter table public.society_profile add constraint society_profile_logo_size check (logo_image is null or length(logo_image) <= 120000);
  end if;
end $$;

create or replace function public.society_public(p_word text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('slug', s.slug, 'name', s.name, 'logo', nullif(p.logo_image, '')))
    from public.societies s
    left join public.society_profile p on p.society_id = s.id and p.id = 1
   where s.slug = lower(trim(coalesce(p_word, ''))) and s.status = 'active'
$$;
revoke all on function public.society_public(text) from public;
grant execute on function public.society_public(text) to anon, authenticated, service_role;

-- Check: the column and the limit exist, the function still answers, anon may call it.
select 'logo_image column exists (expect true)' as what, (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'society_profile' and column_name = 'logo_image'))::text as value
union all select 'size limit exists (expect true)', (exists (select 1 from pg_constraint where conname = 'society_profile_logo_size'))::text
union all select 'society_public finds the first society (expect aakar)', coalesce(public.society_public('aakar') ->> 'slug', 'NO')
union all select 'anon may call society_public (expect true)', has_function_privilege('anon', 'public.society_public(text)', 'execute')::text;
