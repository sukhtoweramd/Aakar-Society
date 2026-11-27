-- MT_19_UNDO.sql (27 Nov 2026) - puts society_public back as MT_16 made it (slug + name only) and removes the logo column.
-- WARNING: dropping the column deletes every society's saved logo (they can be uploaded again). Safe to run again.
create or replace function public.society_public(p_word text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', s.slug, 'name', s.name)
    from public.societies s
   where s.slug = lower(trim(coalesce(p_word, ''))) and s.status = 'active'
$$;
revoke all on function public.society_public(text) from public;
grant execute on function public.society_public(text) to anon, authenticated, service_role;

alter table public.society_profile drop constraint if exists society_profile_logo_size;
alter table public.society_profile drop column if exists logo_image;

select 'logo_image column gone (expect false)' as what, (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'society_profile' and column_name = 'logo_image'))::text as value;
