-- MT_12 (Nov 2026) - multi-tenant step 4d-4: the five booking actions only touch bookings, areas and flats of the CALLER'S society.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_11. Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table and no data. Undo: MT_12_UNDO.sql (puts the five functions back exactly as they were; needs the saved copy made here).
--
-- Why: these functions run with owner rights (they skip the society wall) and take an id from the caller: a booking group, an area, a flat.
-- A login of society B could pass society A's id (or a flat id that exists in both societies) and read, cancel, approve or price A's bookings:
--   * booked_slots(p_from, p_to)     listed the bookings of ALL societies (area ids, flat ids, dates)       -> own society only
--   * cancel_booking(p_group, ..)    found the booking by its group id alone                                -> must be this society's
--   * decide_booking(p_group, ..)    approve / reject by group id alone; also counted the active areas of ALL societies (so "all areas booked"
--                                    could never be true with two societies), used the temporary fallback current_society_or_first() for the bill
--                                    counter, and wrote the notice and the bill without naming a society      -> this society's booking, and every
--                                    row it writes (notice, bill) and the bill counter name the booking's society
--   * request_booking(p_flat, p_areas, ..)  looked the flat and each area up by id alone, so another society's area could be booked and a flat id that
--                                    exists in both societies was ambiguous                                  -> this society's flat and areas; the booking names its society
--   * set_booking_charge(p_area, p_charge)  looked the area up and priced it by id alone                    -> this society's area; the access-log row names its society
-- A login with no society finds nothing in them (the society wall already shows such a login no society rows, and MT_03 counted 0 on Aakar).
-- Not changed: booking_today(), booking_flat_label() (they read no table), and the policies / triggers on bookings (step 4d, group D).
-- All five are called only from the member's own screen (BookingPanel.tsx), never with the server key, so the login's society is always known.
--
-- Every function is rewritten from its CURRENT live text (as MT_09 / MT_11): only the society is added. If a live text has a form this script does not
-- know, it stops with a clear message and changes nothing (the whole script is one batch: an error rolls back everything). The original text of each is first
-- copied into zz_mt12_function_backup (a one-off copy, not society data). Who may call them is untouched (create or replace keeps the grants).

-- 0. Needs ------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.active_society()') is null then raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).'; end if;
  if pg_get_functiondef('public.can_approve_booking()'::regprocedure) !~ 'active_society' then raise exception 'Run MT_11_FLAT_LOOKUPS.sql first (can_approve_booking() does not look in the login''s society yet).'; end if;
end $$;

-- 1. One-off copy of the functions as they are now --------------------------------------------------------------------------------------
create table if not exists public.zz_mt12_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt12_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt12_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt12_function_backup to service_role;

do $$
declare s text; d text;
begin
  foreach s in array array['public.booked_slots(date,date)', 'public.cancel_booking(uuid,text)', 'public.decide_booking(uuid,boolean,text)',
                           'public.request_booking(text,uuid[],date,text,text,boolean)', 'public.set_booking_charge(uuid,numeric)'] loop
    if to_regprocedure(s) is not null then
      d := pg_get_functiondef(s::regprocedure);
      -- only the true original: a function that already names the login's society is never saved over it
      if d !~* 'active_society' then
        insert into public.zz_mt12_function_backup (fn, def) values (s, d)
        on conflict (fn) do update set def = excluded.def, saved_at = now();
      end if;
    end if;
  end loop;
end $$;

-- 2. booked_slots -----------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.booked_slots(date,date)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  newdef := regexp_replace(def, 'from\s+public\.bookings\s+b\s+where\s+', 'from public.bookings b where b.society_id = (select public.active_society()) and ', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'b\.society_id = \(select public\.active_society\(\)\) and ' then 'the bookings lookup was not found' end,
    case when (select count(*) from regexp_matches(newdef, 'public\.bookings', 'gi')) <> 1 then 'another lookup of public.bookings (another form)' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 3. cancel_booking ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.cancel_booking(uuid,text)'; def text; newdef text; failed text; added int;
  filt constant text := 'where society_id = (select public.active_society()) and group_id = p_group';
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the booking that is found, and the booking rows that are changed: both this society's (everything else follows from the row found)
  newdef := regexp_replace(def, 'where\s+group_id\s*=\s*p_group', filt, 'gi');
  added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when added <> 2 then added || ' group lookup(s) filtered, 2 expected' end,
    case when newdef ~* 'where\s+group_id' then 'a group lookup without the society is left' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 4. decide_booking ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.decide_booking(uuid,boolean,text)'; def text; newdef text; failed text; added int;
  filt constant text := 'where society_id = (select public.active_society()) and group_id = p_group';
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the request that is decided: found, rejected, counted, its invoice lines read, approved (5 places): this society's
  newdef := regexp_replace(def, 'where\s+group_id\s*=\s*p_group', filt, 'gi');
  added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
  -- "all areas booked" compares with the active areas of THIS society only
  newdef := regexp_replace(newdef, 'from\s+public\.booking_areas\s+where\s+active\s*;', 'from public.booking_areas where society_id = (select public.active_society()) and active;', 'gi');
  -- the bill counter of the booking's society (instead of the temporary fallback)
  newdef := regexp_replace(newdef, 'public\.current_society_or_first\(\)', 'b.society_id', 'gi');
  -- the notice and the bill are written for the booking's society
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.notices\s*\(\s*title\s*,', 'insert into public.notices (society_id, title,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*title\s*,\s*body\s*,', 'values (b.society_id, title, body,', 'gi');
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.bills\s*\(\s*bill_no\s*,', 'insert into public.bills (society_id, bill_no,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*bno\s*,', 'values (b.society_id, bno,', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when added <> 5 then added || ' group lookup(s) filtered, 5 expected' end,
    case when newdef ~* 'where\s+group_id' then 'a group lookup without the society is left' end,
    case when newdef !~ 'from public\.booking_areas where society_id = \(select public\.active_society\(\)\) and active;' then 'the active areas count was not found' end,
    case when newdef !~ 'where society_id = b\.society_id\s+and\s+id\s*=\s*1' then 'the bill counter has another form' end,
    case when newdef ~* 'current_society_or_first' then 'the temporary fallback is still there' end,
    case when newdef !~ 'insert into public\.notices \(society_id, title,' or newdef !~ 'values \(b\.society_id, title, body,' then 'the notice insert was not found' end,
    case when newdef !~ 'insert into public\.bills \(society_id, bill_no,' or newdef !~ 'values \(b\.society_id, bno,' then 'the bill insert was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 5. request_booking --------------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.request_booking(text,uuid[],date,text,text,boolean)'; def text; newdef text; failed text;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the flat and every area are looked up in this society
  newdef := regexp_replace(def, 'from\s+public\.flats\s+where\s+id\s*=\s*p_flat', 'from public.flats where society_id = (select public.active_society()) and id = p_flat', 'gi');
  newdef := regexp_replace(newdef, 'from\s+public\.booking_areas\s+where\s+id\s*=\s*aid\s+and\s+active', 'from public.booking_areas where society_id = (select public.active_society()) and id = aid and active', 'gi');
  -- the booking names its society (that of the flat that was found)
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.bookings\s*\(\s*group_id\s*,', 'insert into public.bookings (society_id, group_id,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*g\s*,\s*p_flat\s*,', 'values (f.society_id, g, p_flat,', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when newdef !~ 'from public\.flats where society_id = \(select public\.active_society\(\)\) and id = p_flat' then 'the flat lookup was not found' end,
    case when newdef !~ 'from public\.booking_areas where society_id = \(select public\.active_society\(\)\) and id = aid and active' then 'the area lookup was not found' end,
    case when newdef !~ 'insert into public\.bookings \(society_id, group_id,' or newdef !~ 'values \(f\.society_id, g, p_flat,' then 'the booking insert was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 6. set_booking_charge -----------------------------------------------------------------------------------------------------------------
do $$
declare
  s constant text := 'public.set_booking_charge(uuid,numeric)'; def text; newdef text; failed text; added int;
  filt constant text := 'where society_id = (select public.active_society()) and id = p_area';
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  -- the area that is read and the area that is priced: this society's
  newdef := regexp_replace(def, 'where\s+id\s*=\s*p_area', filt, 'gi');
  added := (length(newdef) - length(replace(newdef, filt, ''))) / length(filt);
  -- the access-log row names the society
  newdef := regexp_replace(newdef, 'insert\s+into\s+public\.access_log\s*\(\s*actor\s*,', 'insert into public.access_log (society_id, actor,', 'gi');
  newdef := regexp_replace(newdef, 'values\s*\(\s*who\s*,\s*''booking_charge_set''', 'values (a.society_id, who, ''booking_charge_set''', 'gi');
  failed := concat_ws(', ',
    case when newdef = def then 'nothing was rewritten' end,
    case when added <> 2 then added || ' area lookup(s) filtered, 2 expected' end,
    case when newdef ~* 'where\s+id\s*=\s*p_area' then 'an area lookup without the society is left' end,
    case when newdef !~ 'insert into public\.access_log \(society_id, actor,' or newdef !~ 'values \(a\.society_id, who, ''booking_charge_set''' then 'the access log insert was not found' end);
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $$;

-- 7. Check ------------------------------------------------------------------------------------------------------------------------------
select 'the 5 booking actions name the login''s society (expect 5)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('booked_slots', 'cancel_booking', 'decide_booking', 'request_booking', 'set_booking_charge')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value
union all select 'decide_booking no longer uses the temporary fallback (expect yes)',
       case when pg_get_functiondef('public.decide_booking(uuid,boolean,text)'::regprocedure) !~* 'current_society_or_first' then 'yes' else 'NO' end
union all select 'request_booking callable by members / anon (shown only, MT_12 does not change it; expect true / false)',
       (has_function_privilege('authenticated', 'public.request_booking(text,uuid[],date,text,text,boolean)', 'execute'))::text || ' / '
       || (has_function_privilege('anon', 'public.request_booking(text,uuid[],date,text,text,boolean)', 'execute'))::text
union all select 'original text saved for the undo (expect 5)', (select count(*)::text from public.zz_mt12_function_backup);
