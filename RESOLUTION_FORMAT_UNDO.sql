-- RESOLUTION_FORMAT_UNDO.sql · back to general / bank formats only. Resolutions already issued stay on record (their
-- column stays); formats of kind 'resolution' are switched off and become 'general' so the old rule can return.
-- Run in Supabase > SQL Editor. Safe to re-run.
drop trigger if exists letters_resolution_guard on public.letters;
drop function if exists public.letters_resolution_guard();
update public.letter_templates set kind = 'general', active = false where kind = 'resolution';
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.letter_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.letter_templates drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.letter_templates add constraint letter_templates_kind_check check (kind in ('general', 'bank'));

select 'resolution formats left (expect 0)' as item, count(*)::text as value from public.letter_templates where kind = 'resolution'
union all select 'guard gone (expect 0)', count(*)::text from pg_trigger where tgname = 'letters_resolution_guard' and not tgisinternal;
