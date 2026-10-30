-- Letter requests with standard formats, approval, and unsigned bank letters (30 Oct 2026).
-- Run once in Supabase → SQL Editor after LETTERS.sql, LETTER_REQUESTS.sql and AREAS_BACKUPS.sql. Safe to re-run.
-- Then run sql-security/10_RESTORE_letter_templates.sql.
--
--   • letter_templates: the society's standard letter formats (kept by the committee in BILLING → LETTERS → LETTER FORMATS).
--     A format has a subject, an optional default addressee and a body with fields like {{owner_name}}, {{flat_no}}.
--     kind 'bank' = a letter for a bank: issued as an UNSIGNED copy (no signature or stamp printed); the Chairman / Secretary
--     signs the paper by hand and hands it over; the committee then ticks "signed copy handed over".
--     Every login can read the ACTIVE formats' names (members choose one when asking); committee reads all and edits.
--     Formats are never deleted (switch off instead).
--   • letter_requests: + template_id, + status 'approved', + approved_by / approved_at, + history (who did what, when).
--     Approve / decline: a committee login linked to the Chairman or Secretary flat, or the main admin.
--     A requested letter can be issued only after approval.
--   • letters: + request_id, + unsigned, + handed_over_at / handed_over_by.
-- Starter formats are added only when there are none yet: their wording is a starting point for the committee to check
-- against the society's own formats before use.
-- Undo: LETTER_TEMPLATES_UNDO.sql.

-- 1. Formats
create table if not exists public.letter_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 2 and 120),
  kind        text not null default 'general' check (kind in ('general', 'bank')),
  subject     text not null check (length(trim(subject)) > 0),
  addressee   text,                                   -- default "To"; blank = To whomsoever it may concern
  body        text not null check (length(trim(body)) > 0),
  sort        int not null default 100,
  active      boolean not null default true,
  created_by  text, created_at timestamptz not null default now(),
  updated_by  text, updated_at timestamptz not null default now()
);
alter table public.letter_templates enable row level security;
drop policy if exists members_read_active on public.letter_templates;
drop policy if exists committee_read on public.letter_templates;
drop policy if exists committee_add on public.letter_templates;
drop policy if exists committee_change on public.letter_templates;
create policy members_read_active on public.letter_templates for select to authenticated using (active);
create policy committee_read   on public.letter_templates for select to authenticated using (public.is_committee());
create policy committee_add    on public.letter_templates for insert to authenticated with check (public.is_committee());
create policy committee_change on public.letter_templates for update to authenticated using (public.is_committee()) with check (public.is_committee());
revoke all on public.letter_templates from anon;
grant select, insert, update, delete on public.letter_templates to authenticated, service_role;

insert into public.letter_templates (name, kind, subject, addressee, body, sort)
select v.name, v.kind, v.subject, v.addressee, v.body, v.sort from (values
  ('NOC for bank loan', 'bank', 'No Objection Certificate for housing loan', 'The Branch Manager',
   E'This is to certify that {{owner_name}} is a member of {{society}} and the owner of Flat No. {{flat_no}}, Tower {{tower}}, {{building}}, Ahmedabad, holding share certificate no. {{share_cert_no}}.\n\nThe society has no objection to the member raising a loan from your bank against the security of the said flat, subject to the bye-laws of the society.\n\n{{purpose}}', 10),
  ('NOC for sale of flat', 'general', 'No Objection Certificate for sale of flat', null,
   E'This is to certify that {{owner_name}} is a member of {{society}} and the owner of Flat No. {{flat_no}}, Tower {{tower}}, {{building}}, Ahmedabad, holding share certificate no. {{share_cert_no}}.\n\nThe society has no objection to the sale of the said flat, subject to the transfer being completed as per the bye-laws of the society.\n\n{{purpose}}', 20),
  ('NOC for renting the flat / police verification', 'general', 'No Objection Certificate for renting the flat', null,
   E'This is to certify that {{owner_name}} is a member of {{society}} and the owner of Flat No. {{flat_no}}, Tower {{tower}}, {{building}}, Ahmedabad.\n\nThe society has no objection to the said flat being given on rent, subject to police verification of the tenant and the bye-laws of the society.\n\n{{purpose}}', 30),
  ('Address proof / residence letter', 'general', 'Residence certificate', null,
   E'This is to certify that {{owner_name}} is a member of {{society}} and the owner of Flat No. {{flat_no}}, Tower {{tower}}, {{building}}, Ahmedabad.\n\n{{purpose}}', 40),
  ('No-dues certificate', 'general', 'No-dues certificate', null,
   E'This is to certify that, as per the records of the society, the maintenance dues of Flat No. {{flat_no}}, Tower {{tower}}, {{building}}, Ahmedabad, owned by {{owner_name}}, outstanding as on {{date}} are {{dues}}.\n\n{{purpose}}', 50),
  ('Share certificate / membership letter', 'general', 'Membership certificate', null,
   E'This is to certify that {{owner_name}} is a member of {{society}} since {{member_since}}, holding share certificate no. {{share_cert_no}} in respect of Flat No. {{flat_no}}, Tower {{tower}}, {{building}}, Ahmedabad.\n\n{{purpose}}', 60)
) as v(name, kind, subject, addressee, body, sort)
where not exists (select 1 from public.letter_templates);

-- 2. Requests: format, approval, history
alter table public.letter_requests add column if not exists template_id uuid references public.letter_templates(id) on delete set null;
alter table public.letter_requests add column if not exists approved_by text;
alter table public.letter_requests add column if not exists approved_at timestamptz;
alter table public.letter_requests add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.letter_requests drop constraint if exists letter_requests_status_check;
alter table public.letter_requests add constraint letter_requests_status_check check (status in ('requested', 'approved', 'issued', 'declined', 'withdrawn'));

create or replace function public.can_approve_letters() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_main_admin() or (public.is_committee() and exists (
    select 1 from public.flats f where f.id = public.my_flat() and f.is_committee
       and lower(trim(coalesce(f.committee_role, ''))) in ('chairman', 'secretary')))
$$;
revoke all on function public.can_approve_letters() from public, anon;
grant execute on function public.can_approve_letters() to authenticated;

-- every status change is checked and written to the request's history
create or replace function public.letter_request_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(auth.jwt() ->> 'email', public.my_flat(), 'system');
begin
  if new.status is distinct from old.status then
    if auth.uid() is not null then
      if new.status in ('approved', 'declined') and not public.can_approve_letters() then
        raise exception 'Only the Chairman or the Secretary (from their own committee login) can approve or decline a letter request.';
      end if;
      if new.status = 'approved' and old.status <> 'requested' then raise exception 'Only a waiting request can be approved.'; end if;
      if new.status = 'issued' and old.status <> 'approved' then raise exception 'Approve the request before issuing the letter.'; end if;
    end if;
    if new.status = 'approved' then new.approved_by := who; new.approved_at := now(); end if;
    new.history := coalesce(old.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'by', who, 'status', new.status, 'note', coalesce(new.reason, '')));
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.letter_request_guard() from public, anon, authenticated;
drop trigger if exists letter_request_guard on public.letter_requests;
create trigger letter_request_guard before update on public.letter_requests for each row execute function public.letter_request_guard();

-- the request's first history line (the insert trigger of LETTER_REQUESTS.sql resets the rest)
create or replace function public.letter_request_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := 'requested'; new.letter_id := null; new.reason := null; new.decided_by := null; new.decided_at := null;
  new.approved_by := null; new.approved_at := null;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  new.created_at := now(); new.updated_at := now();
  new.history := jsonb_build_array(jsonb_build_object('at', now(), 'by', coalesce(new.created_by, public.my_flat()), 'status', 'requested', 'note', ''));
  return new;
end $$;

-- 3. Letters: link to the request, unsigned copy, handed over
alter table public.letters add column if not exists request_id uuid;   -- no foreign key: a restore puts letters back before requests
alter table public.letters add column if not exists unsigned boolean not null default false;
alter table public.letters add column if not exists handed_over_at timestamptz;
alter table public.letters add column if not exists handed_over_by text;

-- Check (expected): formats table true • format rules 4 • starter formats ≥ 1 (6 on a first run) • bank formats ≥ 1 •
--                   request status has approved true • request guard on true • letters unsigned column true
select 'formats table' as item, (to_regclass('public.letter_templates') is not null)::text as value
union all select 'format rules', count(*)::text from pg_policies where schemaname = 'public' and tablename = 'letter_templates'
union all select 'starter formats', count(*)::text from public.letter_templates
union all select 'bank formats', count(*)::text from public.letter_templates where kind = 'bank'
union all select 'request status has approved', (pg_get_constraintdef((select oid from pg_constraint where conname = 'letter_requests_status_check')) like '%approved%')::text
union all select 'request guard on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'letter_request_guard' and not tgisinternal)::text
union all select 'letters unsigned column', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'letters' and column_name = 'unsigned')::text;
