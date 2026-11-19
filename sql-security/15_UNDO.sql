-- 15 UNDO · removes the read-only function flat_blockers. Safe to re-run. (The app then refuses to remove flats.)
drop function if exists public.flat_blockers(text[]);
select 'function removed' as item, (to_regprocedure('public.flat_blockers(text[])') is null)::text as value;
