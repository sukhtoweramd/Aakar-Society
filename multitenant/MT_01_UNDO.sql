-- Undo of MT_01_SOCIETIES.sql. Run MT_02_UNDO.sql FIRST (the tables there point to societies).
drop table if exists public.society_memberships;
drop table if exists public.societies;
select 'gone' as what, (to_regclass('public.societies') is null and to_regclass('public.society_memberships') is null)::text as value;
