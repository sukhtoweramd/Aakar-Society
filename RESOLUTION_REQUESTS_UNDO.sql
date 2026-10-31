-- RESOLUTION_REQUESTS_UNDO.sql · members are no longer asked for details. Requests already sent keep what they hold
-- (the details column stays, unused). Run in Supabase > SQL Editor. Safe to re-run.
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
revoke all on function public.letter_request_before_insert() from public, anon;
update public.letter_templates set member_fields = null, request_name = null where member_fields is not null or request_name is not null;

select 'formats asking the member (expect 0)' as item, count(*)::text as value from public.letter_templates where coalesce(array_length(member_fields, 1), 0) > 0;
