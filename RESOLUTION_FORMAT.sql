-- RESOLUTION_FORMAT.sql · Committee resolution as a letter format (Aakar, 31 Oct 2026)
-- First format: RESOLUTION FOR TRANSFER OF FLAT (the society's own wording, from its Word template).
--   • letter_templates.kind gets a third value 'resolution'.
--   • letters.layout ('letter' or 'resolution'): a resolution prints with the committee's signature table
--     (Chairman / Secretary / Committee Member / Date), is issued unsigned and signed by hand, then marked handed over.
--   • Only the Chairman or the Secretary (a committee login linked to their flat, or the main admin) can issue a resolution:
--     the database refuses it for anyone else (can_approve_letters(), as for approving letter requests).
--   • Fields the society's records know (owner_name, flat_no …) fill themselves; any other {{field}} becomes a box when issuing.
--   • Members cannot ask for a resolution (the app leaves it out of the request list); the committee issues it from BILLING → LETTERS.
-- No new table: backups and restores carry the new column. Needs LETTERS.sql and LETTER_TEMPLATES.sql.
-- Run in Supabase > SQL Editor. Safe to re-run. Undo: RESOLUTION_FORMAT_UNDO.sql.

-- 1. kind 'resolution'
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.letter_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.letter_templates drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.letter_templates add constraint letter_templates_kind_check check (kind in ('general', 'bank', 'resolution'));

-- 2. layout on letters
alter table public.letters add column if not exists layout text not null default 'letter';
alter table public.letters drop constraint if exists letters_layout_check;
alter table public.letters add constraint letters_layout_check check (layout in ('letter', 'resolution'));

-- 3. Only the Chairman / Secretary (or main admin) issues a resolution; the server (backup restore) is not affected
create or replace function public.letters_resolution_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.layout = 'resolution' and auth.uid() is not null and not public.can_approve_letters() then
    raise exception 'Only the Chairman or the Secretary (from their own committee login) can issue a resolution.';
  end if;
  return new;
end $$;
drop trigger if exists letters_resolution_guard on public.letters;
create trigger letters_resolution_guard before insert or update of layout on public.letters for each row execute function public.letters_resolution_guard();

-- 4. The society's format (wording exactly as in the Word template). Added only if it is not there yet; edit it later in
--    BILLING → LETTERS → LETTER FORMATS.
insert into public.letter_templates (name, kind, subject, addressee, body, sort)
values ('Resolution for transfer of flat', 'resolution', 'Resolution for transfer of flat', null,
E'Managing Committee Meeting Date: {{meeting_date}}\nResolution No.: {{resolution_no}}

Subject: Approval of Flat Transfer and Acknowledgement of Transfer Fees Received

The Managing Committee of Aakar Co-operative Housing Society Ltd. held its meeting on {{meeting_date}} and considered the application submitted by the existing member, Mr./Mrs. {{owner_name}}, for the transfer of Flat No. {{flat_no}} to Mr./Mrs. {{transferee_name}}.

The Committee noted that the necessary transfer documents have been submitted and the applicable transfer fee of ₹{{fee_amount}} (Rupees {{fee_words}} only) has been received by the Society vide Receipt No. {{receipt_no}} dated {{receipt_date}}.

After considering the application and documents submitted, the following resolution was passed:

“RESOLVED THAT the transfer of Flat No. {{flat_no}}, along with the associated membership and shares of the Society, from the existing member, Mr./Mrs. {{owner_name}}, to the new member, Mr./Mrs. {{transferee_name}}, be and is hereby approved, subject to the applicable provisions of law and the registered bye-laws of the Society.

RESOLVED FURTHER THAT the Managing Committee hereby acknowledges receipt of ₹{{fee_amount}} (Rupees {{fee_words}} only) towards the applicable flat transfer fee from the transferor/transferee, as recorded in the Society''s books of accounts and against Receipt No. {{receipt_no}} dated {{receipt_date}}.

RESOLVED FURTHER THAT the Secretary of the Society is hereby authorised to update the membership register and other relevant records, make the necessary endorsement in the share certificate, and complete the required formalities in favour of the new member.

RESOLVED FURTHER THAT the above transfer and fee receipt shall be recorded in the minutes of the Managing Committee meeting and the Society''s books of accounts.”', 60)
on conflict (name) do nothing;

-- Check: kind allows resolution, layout column, guard on, the format is there, nobody but Chairman / Secretary can issue
select 'resolution kind allowed' as item, (pg_get_constraintdef((select oid from pg_constraint where conname = 'letter_templates_kind_check')) like '%resolution%')::text as value
union all select 'letters.layout column', count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'letters' and column_name = 'layout'
union all select 'issue guard on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'letters_resolution_guard' and not tgisinternal)::text
union all select 'transfer-of-flat format', count(*)::text from public.letter_templates where kind = 'resolution' and name = 'Resolution for transfer of flat'
union all select 'letters issued as resolution', count(*)::text from public.letters where layout = 'resolution';
