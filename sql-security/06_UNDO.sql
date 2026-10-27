-- 06 UNDO · Removes the head-of-family lock (flat logins can again change or remove the head of family).
-- No data is changed.
drop trigger if exists members_head_guard on public.members;
drop function if exists public.members_head_guard();

-- Check: should show false
select 'head of family guard' as item, exists (select 1 from pg_proc where proname = 'members_head_guard')::text as value;
