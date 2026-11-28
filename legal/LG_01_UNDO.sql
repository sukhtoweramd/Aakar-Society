-- LG_01_UNDO.sql (28 Nov 2026) - removes what LG_01 made. Safe to run again.
-- WARNING: this deletes the registry and ALL acceptance records. If any acceptance exists the script stops, because those rows are evidence.
-- To remove them anyway, first copy them out (select * from public.legal_acceptances;) and then change `force boolean := false` below to true.
do $$
declare
  force boolean := false;
  n bigint := 0;
begin
  if to_regclass('public.legal_acceptances') is not null then
    execute 'select count(*) from public.legal_acceptances' into n;
    if n > 0 and not force then
      raise exception 'There are % acceptance records. Nothing was removed. Copy them out first, then set force to true in this script.', n;
    end if;
  end if;
end $$;

drop function if exists public.my_legal_status();
drop function if exists public.accept_legal_document(text, integer);
drop table if exists public.legal_acceptances;
drop table if exists public.legal_documents;
drop function if exists public.legal_acceptances_guard();
drop function if exists public.legal_documents_guard();

select 'legal tables left (expect 0)' as what, count(*)::text as value from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('legal_documents', 'legal_acceptances');
