-- 10 UNDO · the restore function exactly as after script 09 (without letter_templates). Safe to re-run.
create or replace function public.restore_society_backup(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ins text[] := array['flats','billing_settings','signatories','events','notices','maintenance','businesses',
                      'members','emergency_contacts','vehicles','flat_docs','bills','payments','letters','payment_reports','committee_areas','amc_contracts','amc_visits','meetings','meeting_actions',
                      'event_team','event_money','event_registrations','help_guide',
                      'complaints','nominees','nomination_status','booking_areas','bookings','letter_requests',
                      'event_checkins','society_contacts','flat_tenant_logins'];
  t text; i int; cols text; n int; seq text; col record; result jsonb := '{}'::jsonb;
begin
  if p is null or p->>'app' is distinct from 'aakar-society' or jsonb_typeof(p->'tables') <> 'object' then
    raise exception 'This is not an Aakar Society backup file.';
  end if;
  if not (p->'tables' ? 'flats') or jsonb_array_length(p->'tables'->'flats') = 0 then
    raise exception 'The backup has no flats; restore stopped.';
  end if;
  -- Three triggers would change restored rows: complaint_before_insert gives every complaint a new number, status
  -- and dates; nominees_changed writes nomination_status rows (on delete and on insert), which would clash with the
  -- backup's own nomination_status rows; letter_request_before_insert resets every request to "requested". Switch them off for this restore only. ALTER TABLE is part of this
  -- transaction, so if the restore fails everything, including the switch-off, is rolled back.
  begin
  if to_regclass('public.complaints') is not null then alter table public.complaints disable trigger complaint_before_insert; end if;
  if to_regclass('public.nominees') is not null then alter table public.nominees disable trigger nominees_changed; end if;
  if to_regclass('public.letter_requests') is not null then alter table public.letter_requests disable trigger letter_request_before_insert; end if;
  for i in reverse array_length(ins, 1)..1 loop
    t := ins[i];
    if to_regclass('public.' || t) is not null and (p->'tables') ? t then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
  foreach t in array ins loop
    if to_regclass('public.' || t) is null or not ((p->'tables') ? t) then continue; end if;
    if jsonb_array_length(p->'tables'->t) = 0 then result := result || jsonb_build_object(t, 0); continue; end if;
    select string_agg(quote_ident(a.attname), ',') into cols
      from pg_attribute a
     where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and (p->'tables'->t->0) ? a.attname;
    execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)',
                   t, cols, cols, t) using p->'tables'->t;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(t, n);
    for col in select a.attname from pg_attribute a
                where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped loop
      seq := pg_get_serial_sequence('public.' || t, col.attname);
      if seq is not null then
        execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', seq, col.attname, t);
      end if;
    end loop;
  end loop;
  if to_regclass('public.complaints') is not null then alter table public.complaints enable trigger complaint_before_insert; end if;
  if to_regclass('public.nominees') is not null then alter table public.nominees enable trigger nominees_changed; end if;
  if to_regclass('public.letter_requests') is not null then alter table public.letter_requests enable trigger letter_request_before_insert; end if;
  exception when others then
    -- never leave the triggers off (the rollback already undoes the switch-off; this is belt and braces)
    if to_regclass('public.complaints') is not null then alter table public.complaints enable trigger complaint_before_insert; end if;
    if to_regclass('public.nominees') is not null then alter table public.nominees enable trigger nominees_changed; end if;
    if to_regclass('public.letter_requests') is not null then alter table public.letter_requests enable trigger letter_request_before_insert; end if;
    raise;
  end;
  return result;
end $$;
revoke all on function public.restore_society_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_society_backup(jsonb) to service_role;

-- Check: every row should be true
select t as item, (pg_get_functiondef('public.restore_society_backup(jsonb)'::regprocedure) like '%''' || t || '''%')::text as value
from unnest(array['help_guide','complaints','nominees','nomination_status','booking_areas','bookings','letter_requests','event_checkins','society_contacts','flat_tenant_logins']) t
union all
select 'only the server can run it', (not has_function_privilege('authenticated', 'public.restore_society_backup(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.restore_society_backup(jsonb)', 'execute'))::text;
