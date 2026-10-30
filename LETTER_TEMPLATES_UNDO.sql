-- UNDO of LETTER_TEMPLATES.sql: back to requests without formats or approval. Approved requests go back to "requested".
-- Letters keep their text; the unsigned / handed-over marks are removed. Formats are removed. Safe to re-run.

drop trigger if exists letter_request_guard on public.letter_requests;
drop function if exists public.letter_request_guard();
update public.letter_requests set status = 'requested' where status = 'approved';
alter table public.letter_requests drop constraint if exists letter_requests_status_check;
alter table public.letter_requests add constraint letter_requests_status_check check (status in ('requested', 'issued', 'declined', 'withdrawn'));
alter table public.letter_requests drop column if exists history;
alter table public.letter_requests drop column if exists approved_at;
alter table public.letter_requests drop column if exists approved_by;
alter table public.letter_requests drop column if exists template_id;
-- insert trigger exactly as LETTER_REQUESTS.sql
create or replace function public.letter_request_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := 'requested'; new.letter_id := null; new.reason := null; new.decided_by := null; new.decided_at := null;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
alter table public.letters drop column if exists handed_over_by;
alter table public.letters drop column if exists handed_over_at;
alter table public.letters drop column if exists unsigned;
alter table public.letters drop column if exists request_id;
drop function if exists public.can_approve_letters();
drop table if exists public.letter_templates;

-- Check (expected): formats table false • guard gone true
select 'formats table' as item, (to_regclass('public.letter_templates') is not null)::text as value
union all select 'guard gone', (not exists (select 1 from pg_trigger where tgname = 'letter_request_guard'))::text;
