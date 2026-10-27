-- 06 · Head of family is "fill once" for flat logins   (Aakar, decided 27 Oct 2026)
-- Like the owner name (script 05): a flat login may add the head of family while the flat has none, but once the
-- head's name is filled in, only the committee can change that name, remove the head, or make someone else head.
-- Other family members (wife, children, parents…) stay fully editable by the flat. The head's mobile, email, age,
-- profession etc. also stay editable. The committee, and the server (backup / restore), are not affected.
-- Run in Supabase > SQL Editor after the matching app update is live. Safe to re-run. No data is changed.
-- Undo: 06_UNDO.sql.

create or replace function public.members_head_guard() returns trigger
language plpgsql as $$
declare
  fid text;
begin
  -- only flat logins are limited (committee logins and the server are not)
  if public.is_committee() or public.my_flat() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if coalesce(old.is_head, false) and nullif(trim(coalesce(old.name, '')), '') is not null then
      raise exception 'The head of family can be removed only by the committee.';
    end if;
    return old;
  end if;
  fid := new.flat_id;
  if tg_op = 'UPDATE' and coalesce(old.is_head, false) and nullif(trim(coalesce(old.name, '')), '') is not null then
    if new.name is distinct from old.name then
      raise exception 'The head of family''s name is already filled in. Only the committee can change it.';
    end if;
    if not coalesce(new.is_head, false) then
      raise exception 'Only the committee can change who is the head of family.';
    end if;
  end if;
  if coalesce(new.is_head, false) and (tg_op = 'INSERT' or not coalesce(old.is_head, false))
     and exists (select 1 from public.members m
                  where m.flat_id = fid and coalesce(m.is_head, false) and m.id is distinct from new.id
                    and nullif(trim(coalesce(m.name, '')), '') is not null) then
    raise exception 'This flat already has a head of family. Only the committee can change it.';
  end if;
  return new;
end $$;
drop trigger if exists members_head_guard on public.members;
create trigger members_head_guard before insert or update or delete on public.members
  for each row execute function public.members_head_guard();

-- Check: both rows true
select 'head of family guard' as item, exists (select 1 from pg_proc where proname = 'members_head_guard')::text as value
union all select 'trigger on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'members_head_guard' and not tgisinternal)::text;
