-- MT_14 (Nov 2026) - multi-tenant step 4d-6: the eight complaint / letter-request / meeting / payment-reference actions only touch the CALLER'S society.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_13 (MT_11 is needed). Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table and no data. Undo: MT_14_UNDO.sql (puts the eight functions back exactly as they were; needs the saved copy made here).
--
-- Why: these functions run with owner rights (they skip the society wall) and take an id from the caller. A login of society B could pass society A's id
-- (or rely on a flat id that exists in both societies) and read or change A's things:
--   * update_complaint(p_id, ..)      found and changed the complaint by id alone; is_committee() is true for ANY society's committee, and "my flat is the
--                                     assigned / backup flat" compared flat ids only                                  -> this society's complaint, or "Complaint not found."
--   * reassign_complaint(p_id, p_area) found the complaint and the area by id alone                                    -> both this society's
--   * withdraw_letter_request(p_id)   withdrew a letter request by id alone (committee of any society, or flat A101 of any society) -> this society's request
--   * mark_my_action_done(p_id, ..)   closed an action point by id alone (owner_flat = my_flat() compared flat ids only)   -> this society's action point
--   * my_action_points()              listed the action points of flat A101 in EVERY society                               -> this society's
--   * my_committee_meetings()         listed the committee meetings of EVERY society to any committee login               -> this society's
--   * my_meeting(p_meeting)           returned any society's meeting and its action points to a committee login           -> this society's meeting, else nothing (null)
--   * utr_already_reported(p_ref)     looked for the payment reference in EVERY society, so it told a member that another society had reported it, and
--                                     on which date                                                                       -> this society's reports and payments only
-- A login with no society finds nothing in them (the society wall already shows such a login no society rows).
-- NOT changed on purpose: storage_stats() (ADMIN -> storage used) returns database-wide sizes and row counts only - no names, no row data. It stays as it is
-- until the platform-owner screen (the whole database is one thing there); a committee of any society sees the same totals. Also not changed: my_flat(),
-- is_committee(), and the policies / triggers on these tables (step 4d, group D).
-- All eight are called only from the member's own screen, never with the server key, so the login's society is always known.
--
-- Every function is rewritten from its CURRENT live text (as MT_09 / MT_11 / MT_12 / MT_13): only the society is added. If a live text has a form this script
-- does not know, it stops with a clear message and changes nothing (the whole script is one batch: an error rolls back everything). The original text of
-- each is first copied into zz_mt14_function_backup (a one-off copy, not society data). Who may call them is untouched (create or replace keeps the grants).

-- 0. Needs ------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.active_society()') is null then raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).'; end if;
  if pg_get_functiondef('public.my_tenant_flat()'::regprocedure) !~ 'active_society' then raise exception 'Run MT_11_FLAT_LOOKUPS.sql first (my_tenant_flat() does not look in the login''s society yet).'; end if;
end $$;

-- 1. One-off copy of the functions as they are now --------------------------------------------------------------------------------------
create table if not exists public.zz_mt14_function_backup (
  fn       text primary key,
  def      text not null,
  saved_at timestamptz not null default now()
);
alter table public.zz_mt14_function_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt14_function_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt14_function_backup to service_role;

do $$
declare s text; d text;
begin
  foreach s in array array['public.mark_my_action_done(uuid,text)', 'public.my_action_points()', 'public.my_committee_meetings()', 'public.my_meeting(uuid)',
                           'public.reassign_complaint(uuid,uuid)', 'public.update_complaint(uuid,text,text)', 'public.utr_already_reported(text)', 'public.withdraw_letter_request(uuid)'] loop
    if to_regprocedure(s) is not null then
      d := pg_get_functiondef(s::regprocedure);
      -- only the true original: a function that already names the login's society is never saved over it
      if d !~* 'active_society' then
        insert into public.zz_mt14_function_backup (fn, def) values (s, d)
        on conflict (fn) do update set def = excluded.def, saved_at = now();
      end if;
    end if;
  end loop;
end $$;

-- 2. The patch helper (a temporary function: gone when the SQL Editor session ends, nothing is left in the database) -----------------------
-- For one function: every pattern must be found exactly the expected number of times in the live text, each is replaced, and no "left over" pattern may remain.
create or replace function pg_temp.mt14_patch(s text, pats text[], repls text[], wants int[], leftover text[])
returns void language plpgsql as $f$
declare def text; newdef text; failed text := ''; n int; i int;
begin
  if to_regprocedure(s) is null then raise exception '% is missing; nothing was changed.', s; end if;
  def := pg_get_functiondef(s::regprocedure);
  if def ~* 'active_society' then raise notice '% already looks in the login''s society', s; return; end if;
  newdef := def;
  for i in 1 .. array_length(pats, 1) loop
    n := (select count(*) from regexp_matches(newdef, pats[i], 'gi'));
    if n <> wants[i] then failed := concat_ws(', ', nullif(failed, ''), 'step ' || i || ': found ' || n || ' time(s), ' || wants[i] || ' expected'); end if;
    newdef := regexp_replace(newdef, pats[i], repls[i], 'gi');
  end loop;
  if leftover is not null then
    for i in 1 .. array_length(leftover, 1) loop
      if newdef ~* leftover[i] then failed := concat_ws(', ', nullif(failed, ''), 'a lookup without the society is left (' || i || ')'); end if;
    end loop;
  end if;
  if newdef = def then failed := concat_ws(', ', nullif(failed, ''), 'nothing was rewritten'); end if;
  if failed <> '' then
    raise exception '% has an unexpected form (%); nothing was changed. Send me its text.', s, failed;
  end if;
  execute newdef;
end $f$;

-- 3. The eight functions ----------------------------------------------------------------------------------------------------------------
-- mark_my_action_done: the action point is this society's
select pg_temp.mt14_patch('public.mark_my_action_done(uuid,text)',
  array['where\s+id\s*=\s*p_id\s+and\s+status\s*=\s*''open'''],
  array['where society_id = (select public.active_society()) and id = p_id and status = ''open'''],
  array[1], array['where\s+id\s*=\s*p_id']);

-- my_action_points: this society's action points (and its meetings / events)
select pg_temp.mt14_patch('public.my_action_points()',
  array['join\s+public\.meetings\s+m\s+on\s+m\.id\s*=\s*a\.meeting_id',
        'left\s+join\s+public\.events\s+e\s+on\s+e\.id\s*=\s*m\.event_id',
        'where\s+public\.my_flat\(\)\s+is\s+not\s+null'],
  array['join public.meetings m on m.society_id = a.society_id and m.id = a.meeting_id',
        'left join public.events e on e.society_id = m.society_id and e.id = m.event_id',
        'where a.society_id = (select public.active_society()) and public.my_flat() is not null'],
  array[1, 1, 1], null);

-- my_committee_meetings: this society's committee meetings
select pg_temp.mt14_patch('public.my_committee_meetings()',
  array['where\s+m\.kind\s*=\s*''Committee''\s+and\s+\('],
  array['where m.society_id = (select public.active_society()) and m.kind = ''Committee'' and ('],
  array[1], null);

-- my_meeting: this society's meeting and action points; a committee login of another society gets nothing (null)
select pg_temp.mt14_patch('public.my_meeting(uuid)',
  array['\mm\.id\s*=\s*p_meeting',
        'a\.meeting_id\s*=\s*p_meeting',
        'left\s+join\s+public\.events\s+e\s+on\s+e\.id\s*=\s*m\.event_id',
        'case\s+when\s+public\.is_committee\(\)\s+or'],
  array['m.society_id = (select public.active_society()) and m.id = p_meeting',
        'a.society_id = (select public.active_society()) and a.meeting_id = p_meeting',
        'left join public.events e on e.society_id = m.society_id and e.id = m.event_id',
        'case when public.is_committee() and exists (select 1 from public.meetings m0 where m0.society_id = (select public.active_society()) and m0.id = p_meeting) or'],
  array[4, 2, 1, 1], null);

-- reassign_complaint: the area and the complaint are this society's
select pg_temp.mt14_patch('public.reassign_complaint(uuid,uuid)',
  array['from\s+public\.committee_areas\s+where\s+id\s*=\s*p_area',
        'where\s+id\s*=\s*p_id\s+returning'],
  array['from public.committee_areas where society_id = (select public.active_society()) and id = p_area',
        'where society_id = (select public.active_society()) and id = p_id returning'],
  array[1, 1], array['where\s+id\s*=\s*p_']);

-- update_complaint: the complaint is this society's (found, and changed)
select pg_temp.mt14_patch('public.update_complaint(uuid,text,text)',
  array['from\s+public\.complaints\s+where\s+id\s*=\s*p_id\s+for\s+update',
        'where\s+id\s*=\s*p_id\s+returning'],
  array['from public.complaints where society_id = (select public.active_society()) and id = p_id for update',
        'where society_id = (select public.active_society()) and id = p_id returning'],
  array[1, 1], array['where\s+id\s*=\s*p_id']);

-- utr_already_reported: this society's reports and payments only
select pg_temp.mt14_patch('public.utr_already_reported(text)',
  array['where\s+pr\.status\s+in',
        'where\s+p\.status\s*=\s*''active'''],
  array['where pr.society_id = (select public.active_society()) and pr.status in',
        'where p.society_id = (select public.active_society()) and p.status = ''active'''],
  array[1, 1], null);

-- withdraw_letter_request: the request is this society's
select pg_temp.mt14_patch('public.withdraw_letter_request(uuid)',
  array['where\s+id\s*=\s*p_id\s+and\s+status\s*=\s*''requested'''],
  array['where society_id = (select public.active_society()) and id = p_id and status = ''requested'''],
  array[1], array['where\s+id\s*=\s*p_id']);

-- 4. Check ------------------------------------------------------------------------------------------------------------------------------
select 'the 8 actions name the login''s society (expect 8)' as what,
       (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('mark_my_action_done', 'my_action_points', 'my_committee_meetings', 'my_meeting', 'reassign_complaint', 'update_complaint', 'utr_already_reported', 'withdraw_letter_request')
           and pg_get_functiondef(p.oid) ~ 'active_society')::text as value
union all select 'my_meeting gives a committee login of another society nothing (expect yes)',
       case when pg_get_functiondef('public.my_meeting(uuid)'::regprocedure) ~ 'm0\.society_id = \(select public\.active_society\(\)\)' then 'yes' else 'NO' end
union all select 'storage_stats left as it is on purpose (database-wide sizes only; expect no)',
       case when pg_get_functiondef('public.storage_stats()'::regprocedure) ~ 'active_society' then 'yes' else 'no' end
union all select 'actions callable by members / anon (shown only, MT_14 does not change it; expect true / false)',
       (has_function_privilege('authenticated', 'public.update_complaint(uuid,text,text)', 'execute'))::text || ' / '
       || (has_function_privilege('anon', 'public.update_complaint(uuid,text,text)', 'execute'))::text
union all select 'original text saved for the undo (expect 8)', (select count(*)::text from public.zz_mt14_function_backup);
