-- RESOLUTION_REQUESTS.sql · A member can ask for a committee resolution (e.g. transfer of flat) and give the details only
-- the member knows (Aakar, 31 Oct 2026).
--   • letter_templates.member_fields: which fill-in fields of a format are asked from the member (the committee ticks them
--     in LETTER FORMATS). For "Resolution for transfer of flat": the new member's name (transferee_name).
--   • letter_templates.request_name: the name members pick when asking ("Request for transfer of flat"); the letter the committee
--     issues in reply keeps the format's own name ("Resolution for transfer of flat").
--   • letter_requests.details: what the member typed. The database keeps only the fields the format asks for (each at most
--     200 characters) and refuses a request with one of them empty. A member cannot change it afterwards.
--   • The request goes the usual way: the Chairman or Secretary APPROVES it (after the committee meeting), then ISSUES the
--     resolution with the existing member (from the records) and the new member already filled in; the committee fills
--     the rest (meeting date, resolution no., fee, receipt).
-- Needs LETTER_TEMPLATES.sql and RESOLUTION_FORMAT.sql. No new table. Run in Supabase > SQL Editor. Safe to re-run.
-- Undo: RESOLUTION_REQUESTS_UNDO.sql.

alter table public.letter_templates add column if not exists member_fields text[];            -- null / empty = nothing asked from the member
alter table public.letter_templates add column if not exists request_name text;               -- what a member picks when asking (blank = the format's own name)
alter table public.letter_requests add column if not exists details jsonb not null default '{}'::jsonb;

-- A new request: as before, plus the member's details are checked and cleaned against the format
create or replace function public.letter_request_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare tpl public.letter_templates; k text; v text; missing text[] := '{}'; clean jsonb := '{}'::jsonb;
begin
  new.status := 'requested'; new.letter_id := null; new.reason := null; new.decided_by := null; new.decided_at := null;
  new.approved_by := null; new.approved_at := null;
  new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  new.created_at := now(); new.updated_at := now();
  new.history := jsonb_build_array(jsonb_build_object('at', now(), 'by', coalesce(new.created_by, public.my_flat()), 'status', 'requested', 'note', ''));
  if new.template_id is not null then
    select * into tpl from public.letter_templates where id = new.template_id;
    if found and coalesce(array_length(tpl.member_fields, 1), 0) > 0 then
      foreach k in array tpl.member_fields loop
        v := nullif(trim(coalesce(new.details ->> k, '')), '');
        if v is null then missing := missing || k; else clean := clean || jsonb_build_object(k, left(v, 200)); end if;
      end loop;
      if array_length(missing, 1) > 0 then raise exception 'Please fill in: %', replace(array_to_string(missing, ', '), '_', ' '); end if;
    end if;
  end if;
  new.details := clean;                                  -- only the fields the format asks for
  return new;
end $$;
revoke all on function public.letter_request_before_insert() from public, anon;

-- A request's details are fixed once sent (the committee can still change them; members have no update rule)
-- The society's transfer-of-flat resolution: the member asks for "Request for transfer of flat" and gives the new member's name;
-- the Chairman's reply is the "Resolution for transfer of flat". Set once; the committee may change both later in LETTER FORMATS.
update public.letter_templates set member_fields = array['transferee_name']
 where name = 'Resolution for transfer of flat' and kind = 'resolution' and member_fields is null;
update public.letter_templates set request_name = 'Request for transfer of flat'
 where name = 'Resolution for transfer of flat' and kind = 'resolution' and request_name is null;

-- Check: columns 2, trigger on, transfer-of-flat asks for the new member's name
select 'new columns (expect 3)' as item, count(*)::text as value from information_schema.columns where table_schema = 'public'
  and ((table_name = 'letter_templates' and column_name in ('member_fields', 'request_name')) or (table_name = 'letter_requests' and column_name = 'details'))
union all select 'request insert check on', (select bool_and(tgenabled <> 'D') from pg_trigger where tgname = 'letter_request_before_insert' and not tgisinternal)::text
union all select 'members ask for', coalesce((select request_name from public.letter_templates where name = 'Resolution for transfer of flat'), 'format missing: run RESOLUTION_FORMAT.sql')
union all select 'and are asked', coalesce((select array_to_string(member_fields, ', ') from public.letter_templates where name = 'Resolution for transfer of flat'), 'format missing: run RESOLUTION_FORMAT.sql');
