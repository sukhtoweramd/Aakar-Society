-- MT_13 (Nov 2026) - multi-tenant step 4d-5: the eight event actions only touch events, registrations, passes and event money of the CALLER'S society.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_12 (MT_11 is needed). Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table and no data. Undo: MT_13_UNDO.sql (puts the eight functions back exactly as they were; needs the saved copy made here).
--
-- Why: these functions run with owner rights (they skip the society wall) and take an id from the caller: an event, a registration, a pass, a check-in.
-- A login of society B could pass society A's id (or a flat id that exists in both societies) and read or change A's event things:
--   * my_event_role(p_event)         found the caller's team row by event id + flat id only, so flat A101 of society B got the role of A101 of society A
--                                    in A's event (and with it the right to scan passes, confirm payments, change settings)  -> this society's team only
--   * gate_pass(p_code, ..)          found the registration by the id inside the pass code alone, so a committee login of society B could scan and
--                                    admit people on society A's pass (is_committee() is true for any society's committee)     -> this society's registration;
--                                    the check-in names its society
--   * gate_undo(p_id)                found and deleted a check-in by id alone                                                   -> this society's check-in
--   * register_for_event(..)         found the event by id alone, so a committee login (or a convenor) of society B could register a flat for A's event
--                                                                                                                              -> this society's event; the
--                                    registration looks in and names the event's society
--   * set_event_registration(..) / set_event_money_settings(..)   updated the event by id alone (is_committee() of any society passed the check)
--                                                                                                                              -> this society's event, or "Event not found."
--   * submit_event_payment(..) / verify_event_payment(..)   found and updated the registration by id alone; verify_event_payment also looked the
--                                    cash taker's flat up by flat id alone (a name of another society's flat could land in the note) and wrote the money
--                                    row without naming a society                                                               -> this society's registration;
--                                    the taker's flat and team row are the registration's society; the money row names it
-- A login with no society finds nothing in them (the society wall already shows such a login no society rows).
-- Not changed: my_flat() / my_tenant_flat() (MT_11 did the tenant one), and the policies / triggers on the event tables (step 4d, group D).
-- All eight are called only from the member's own screen, never with the server key, so the login's society is always known.
--
-- Every function is rewritten from its CURRENT live text (as MT_09 / MT_11 / MT_12): only the society is added. If a live text has a form this script
-- does not know, it stops with a clear message and changes nothing (the whole script is one batch: an error rolls back everything). The original text of
-- each is first copied into zz_mt13_function_backup (a one-off copy, not society data). Who may call them is untouched (create or replace keeps the grants).

-- 0. Needs ------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.active_society()') is null then raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).'; end if;
  if pg_get_functiondef('public.my_tenant_flat()'::regprocedure) !~ 'active_society' then raise exception 'Run MT_11_FLAT_LOOKUPS.sql first (my_tenant_flat() does not look in the login''s society yet).'; end if;
end $$;

-- 1. One-off copy of the functions as they are now --------------------------------------------------------------------------------------
create table if not exists public.zz_mt13_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt13_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt13_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt13_function_backup to service_role;

do $$
declare s text; d text;
begin
  foreach s in array array['public.my_event_role(uuid)', 'public.gate_pass(text,integer)', 'public.gate_undo(uuid)', 'public.register_for_event(uuid,text,jsonb)',
                           'public.set_event_money_settings(uuid,numeric,numeric,numeric,boolean)', 'public.set_event_registration(uuid,jsonb,boolean,timestamptz,text,boolean)',
                           'public.submit_event_payment(uuid,text,numeric,date,text,text,text,text)', 'public.verify_event_payment(uuid,boolean,text)'] loop
    if to_regprocedure(s) is not null then
      d := pg_get_functiondef(s::regprocedure);
      -- only the true original: a function that already names the login's society is never saved over it
      if d !~* 'active_society' then
        insert into public.zz_mt13_function_backup (fn, def) values (s, d)
        on conflict (fn) do update set def = excluded.def, saved_at = now();
      end if;
    end if;
  end loop;
end $$;

-- 2. my_event_role ----------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.my_event_role(uuid)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  newdef := regexp_replace(def, 'where\s+t\.event_id\s*=\s*p_event\s+and', 'where t.society_id = (select public.active_society()) and t.event_id = p_event and', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'where t\.society_id = \(select public\.active_society\(\)\) and t\.event_id = p_event and' then 'the team lookup was not found' end,
    case when (select count(*) from regexp_matches(newdef, 'public\.event_team', 'gi')) <> 1 then 'another lookup of public.event_team (another form)' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 3. gate_pass --------------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.gate_pass(text,integer)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the registration named on the pass is this society's; the check-in names the registration's society
  newdef := regexp_replace(def, 'from\s+public\.event_registrations\s+where\s+id\s*=\s*parts\[2\]::uuid', 'from public.event_registrations where society_id = (select public.active_society()) and id = parts[2]::uuid', 'gi');
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.event_checkins\s*\(\s*event_id\s*,', 'insert into public.event_checkins (society_id, event_id,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*r\.event_id\s*,', 'values (r.society_id, r.event_id,', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'from public\.event_registrations where society_id = \(select public\.active_society\(\)\) and id = parts\[2\]::uuid' then 'the registration lookup was not found' end,
    case when newdef ~* 'where\s+id\s*=\s*parts' then 'a registration lookup without the society is left' end,
    case when newdef !~ 'insert into public\.event_checkins \(society_id, event_id,' or newdef !~ 'values \(r\.society_id, r\.event_id,' then 'the check-in insert was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 4. gate_undo --------------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.gate_undo(uuid)'; def text; newdef text; failed text; added int;
  filt constant text := 'public.event_checkins where society_id = (select public.active_society()) and id = p_id';
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the check-in that is found and the check-in that is deleted: this society's
  newdef := regexp_replace(def, 'public\.event_checkins\s+where\s+id\s*=\s*p_id', filt, 'gi');
  added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when added <> 2 then added || ' check-in lookup(s) filtered, 2 expected' end,
    case when newdef ~* 'where\s+id\s*=\s*p_id' then 'a check-in lookup without the society is left' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 5. register_for_event -----------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.register_for_event(uuid,text,jsonb)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the event is this society's ("Event not found." otherwise); the flat's registration is looked up in, and written for, the event's society
  newdef := regexp_replace(def, 'into\s+ev\s+from\s+public\.events\s+where\s+id\s*=\s*p_event', 'into ev from public.events where society_id = (select public.active_society()) and id = p_event', 'gi');
  newdef := regexp_replace(newdef, 'from\s+public\.event_registrations\s+where\s+event_id\s*=\s*p_event\s+and\s+flat_id\s*=\s*flat', 'from public.event_registrations where society_id = ev.society_id and event_id = p_event and flat_id = flat', 'gi');
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.event_registrations\s+as\s+x\s*\(\s*event_id\s*,', 'insert into public.event_registrations as x (society_id, event_id,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*p_event\s*,\s*flat\s*,', 'values (ev.society_id, p_event, flat,', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'into ev from public\.events where society_id = \(select public\.active_society\(\)\) and id = p_event' then 'the event lookup was not found' end,
    case when newdef !~ 'from public\.event_registrations where society_id = ev\.society_id and event_id = p_event and flat_id = flat' then 'the registration lookup was not found' end,
    case when newdef ~* 'where\s+id\s*=\s*p_event' or newdef ~* 'where\s+event_id\s*=\s*p_event' then 'a lookup without the society is left' end,
    case when newdef !~ 'insert into public\.event_registrations as x \(society_id, event_id,' or newdef !~ 'values \(ev\.society_id, p_event, flat,' then 'the registration insert was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 6. set_event_money_settings -----------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.set_event_money_settings(uuid,numeric,numeric,numeric,boolean)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the event that is changed is this society's; another society's event gives "Event not found." instead of changing nothing quietly
  newdef := regexp_replace(def, '(accounts_public\s*=\s*coalesce\(\s*p_public\s*,\s*false\s*\))\s+where\s+id\s*=\s*p_event',
                           '\1 where society_id = (select public.active_society()) and id = p_event; if not found then raise exception ''Event not found.''; end if', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'where society_id = \(select public\.active_society\(\)\) and id = p_event; if not found then raise exception ''Event not found\.''; end if' then 'the event update was not found' end,
    case when newdef ~* 'where\s+id\s*=\s*p_event' then 'an event lookup without the society is left' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 7. set_event_registration -------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.set_event_registration(uuid,jsonb,boolean,timestamptz,text,boolean)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  newdef := regexp_replace(def, '(reg_prefill\s*=\s*coalesce\(\s*p_prefill\s*,\s*true\s*\))\s+where\s+id\s*=\s*p_event',
                           '\1 where society_id = (select public.active_society()) and id = p_event; if not found then raise exception ''Event not found.''; end if', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'where society_id = \(select public\.active_society\(\)\) and id = p_event; if not found then raise exception ''Event not found\.''; end if' then 'the event update was not found' end,
    case when newdef ~* 'where\s+id\s*=\s*p_event' then 'an event lookup without the society is left' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 8. submit_event_payment ---------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.submit_event_payment(uuid,text,numeric,date,text,text,text,text)'; def text; newdef text; failed text; added int;
  filt constant text := 'where society_id = (select public.active_society()) and id = p_reg';
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the registration that is found and the registration that is changed: this society's
  newdef := regexp_replace(def, 'where\s+id\s*=\s*p_reg', filt, 'gi');
  added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when added <> 2 then added || ' registration lookup(s) filtered, 2 expected' end,
    case when newdef ~* 'where\s+id\s*=\s*p_reg' then 'a registration lookup without the society is left' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 9. verify_event_payment ---------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.verify_event_payment(uuid,boolean,text)'; def text; newdef text; failed text; added int;
  filt constant text := 'where society_id = (select public.active_society()) and id = p_reg';
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the registration that is found, rejected and confirmed (3 places): this society's
  newdef := regexp_replace(def, 'where\s+id\s*=\s*p_reg', filt, 'gi');
  added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
  -- the cash taker's flat and team row are those of the registration's society
  newdef := regexp_replace(newdef, 'from\s+public\.flats\s+f\s+left\s+join\s+public\.event_team\s+t\s+on\s+t\.flat_id\s*=\s*f\.id\s+and\s+t\.event_id\s*=\s*r\.event_id\s+where\s+f\.id\s*=\s*r\.cash_to',
                           'from public.flats f left join public.event_team t on t.society_id = f.society_id and t.flat_id = f.id and t.event_id = r.event_id where f.society_id = r.society_id and f.id = r.cash_to', 'gi');
  -- the money row names the registration's society
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.event_money\s*\(\s*event_id\s*,', 'insert into public.event_money (society_id, event_id,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*r\.event_id\s*,', 'values (r.society_id, r.event_id,', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when added <> 3 then added || ' registration lookup(s) filtered, 3 expected' end,
    case when newdef ~* 'where\s+id\s*=\s*p_reg' then 'a registration lookup without the society is left' end,
    case when newdef !~ 'where f\.society_id = r\.society_id and f\.id = r\.cash_to' then 'the cash taker lookup was not found' end,
    case when newdef !~ 'insert into public\.event_money \(society_id, event_id,' or newdef !~ 'values \(r\.society_id, r\.event_id,' then 'the money insert was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 10. Check -----------------------------------------------------------------------------------------------------------------------------
select 'the 8 event actions name the login''s society (expect 8)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('my_event_role', 'gate_pass', 'gate_undo', 'register_for_event', 'set_event_money_settings', 'set_event_registration', 'submit_event_payment', 'verify_event_payment')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value
union all select 'verify_event_payment names the society on the money row and the cash taker (expect yes)',
       case when pg_get_functiondef('public.verify_event_payment(uuid,boolean,text)'::regprocedure) ~ 'values \(r\.society_id, r\.event_id,'
             and pg_get_functiondef('public.verify_event_payment(uuid,boolean,text)'::regprocedure) ~ 'f\.society_id = r\.society_id' then 'yes' else 'NO' end
union all select 'gate_pass callable by members / anon (shown only, MT_13 does not change it; expect true / false)',
       (has_function_privilege('authenticated', 'public.gate_pass(text,integer)', 'execute'))::text || ' / '
       || (has_function_privilege('anon', 'public.gate_pass(text,integer)', 'execute'))::text
union all select 'original text saved for the undo (expect 8)', (select count(*)::text from public.zz_mt13_function_backup);
