-- MT_10 (Nov 2026) - multi-tenant step 4d-2: the three directory views show only the society of the login that is asking.
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_09. Try it on the test project ("aanganone") first. Safe to run again.
-- Changes no table and no data. Undo: MT_10_UNDO.sql (puts the three views back exactly as they were; needs the saved copy made here).
--
-- Why: flat_directory, member_directory and business_directory run with their OWNER's rights (security_invoker = false) so that a member
-- can see the names the society chooses to show. That also skips the society wall (MT_04): with a second society every member could read the
-- OTHER society's flats, family members and business entries through them, and a flat id like A101 (the same in two societies since MT_07)
-- would join the wrong society's members. After this script:
--   * every row must belong to active_society() (the society of the login; nobody logged in / no membership = no rows);
--   * members and flats are joined on (society_id, flat id), never on the flat id alone.
-- The columns, their order and their meaning stay exactly as they are: the screens change nothing. The three views are rebuilt from the
-- latest definitions in the repo (COMMITTEE_ROLES.sql, DOB.sql, sql-security/13); before anything is changed the script checks that the live
-- column list is exactly the expected one, and stops with a clear message otherwise. The original text of each view is first copied into
-- zz_mt10_view_backup (a one-off copy, not society data) for the undo.
-- Note: in the SQL Editor (no login) these views now return 0 rows: that is expected, they answer only for a logged-in member.

-- 1. One-off copy of the views as they are now ----------------------------------------------------------------------------------------
create table if not exists public.zz_mt10_view_backup (
  view_name text primary key,
  def       text not null,
  options   text not null default '',
  saved_at  timestamptz not null default now()
);
alter table public.zz_mt10_view_backup enable row level security;      -- no policy: only the SQL Editor / server key can read it
revoke all on public.zz_mt10_view_backup from anon, authenticated;
grant select, insert, update, delete on public.zz_mt10_view_backup to service_role;

do $$
declare v text; d text;
begin
  foreach v in array array['flat_directory', 'member_directory', 'business_directory'] loop
    if to_regclass('public.' || v) is null then
      raise exception 'The view % does not exist here (run the older scripts first: DIRECTORY_CONSENT.sql, RESIDENT_ACCESS.sql, sql-security/13).', v;
    end if;
    d := pg_get_viewdef(('public.' || v)::regclass, true);
    -- only the ORIGINAL text is saved (once a view names active_society it has already been changed by this script)
    if d !~ 'active_society' then
      insert into public.zz_mt10_view_backup (view_name, def, options)
      values (v, d, coalesce((select array_to_string(c.reloptions, ',') from pg_class c where c.oid = ('public.' || v)::regclass), ''))
      on conflict (view_name) do update set def = excluded.def, options = excluded.options, saved_at = now();
    end if;
  end loop;
end $$;

-- 2. Check the live columns, then rebuild the views -----------------------------------------------------------------------------------
do $$
declare
  v text; want text; got text;
begin
  if to_regprocedure('public.active_society()') is null then
    raise exception 'Run MT_03_ACTIVE_SOCIETY.sql first (public.active_society() is missing).';
  end if;
  for v, want in
    select * from (values
      ('flat_directory',     'id,tower,floor,flat_no,owner_name,is_committee,status,occupancy,tenant_name,committee_role'),
      ('member_directory',   'flat_id,tower,floor,owner_name,is_committee,consent,member_id,member_name,relation,mobile,is_head,occupancy,tenant_name,committee_role,birth_day,birth_month'),
      ('business_directory', 'id,flat_id,name,occupation,business_name,business_category,office_address,office_phone,tower')
    ) t(view_name, cols)
  loop
    select string_agg(a.attname, ',' order by a.attnum) into got
      from pg_attribute a where a.attrelid = ('public.' || v)::regclass and a.attnum > 0 and not a.attisdropped;
    if got is distinct from want then
      raise exception 'The view % has columns (%) instead of the expected (%); nothing was changed. Send me its text.', v, got, want;
    end if;
  end loop;
end $$;

create or replace view public.flat_directory with (security_invoker = false) as
  select f.id, f.tower, f.floor, f.flat_no, f.owner_name, f.is_committee, f.status, f.occupancy, f.tenant_name, f.committee_role
    from public.flats f
   where f.society_id = (select public.active_society());

create or replace view public.member_directory with (security_invoker = false) as
  select f.id as flat_id, f.tower, f.floor, f.owner_name, f.is_committee, f.directory_consent as consent,
         m.id as member_id, m.name as member_name, m.relation, m.mobile, coalesce(m.is_head, false) as is_head,
         f.occupancy, f.tenant_name, f.committee_role,
         extract(day from m.dob)::int as birth_day, extract(month from m.dob)::int as birth_month
    from public.flats f
    left join public.members m on m.society_id = f.society_id and m.flat_id = f.id and f.directory_consent = true
   where f.society_id = (select public.active_society());

create or replace view public.business_directory with (security_invoker = false) as
  select m.id, m.flat_id, m.name, m.occupation, m.business_name, m.business_category, m.office_address, m.office_phone, f.tower
    from public.members m
    left join public.flats f on f.society_id = m.society_id and f.id = m.flat_id
   where m.society_id = (select public.active_society())
     and coalesce(m.occupation, m.business_name, m.office_address, m.office_phone) is not null
     and (f.directory_consent = true or m.flat_id = public.my_flat());

-- nobody without a login ever reads them; members only through their own login (grants of the older scripts stay)
revoke all on public.flat_directory, public.member_directory, public.business_directory from anon, public;

-- 3. Check ----------------------------------------------------------------------------------------------------------------------------
select 'the three views name the society of the login (expect yes / yes / yes)' as what,
  concat_ws(' / ',
    case when pg_get_viewdef('public.flat_directory'::regclass, true) ~ 'active_society' then 'yes' else 'NO' end,
    case when pg_get_viewdef('public.member_directory'::regclass, true) ~ 'active_society' then 'yes' else 'NO' end,
    case when pg_get_viewdef('public.business_directory'::regclass, true) ~ 'active_society' then 'yes' else 'NO' end) as value
union all select 'still owner-rights views, so members see the shared names (expect true / true / true)',
  concat_ws(' / ',
    coalesce((select ('security_invoker=false' = any (c.reloptions))::text from pg_class c where c.oid = 'public.flat_directory'::regclass), 'false'),
    coalesce((select ('security_invoker=false' = any (c.reloptions))::text from pg_class c where c.oid = 'public.member_directory'::regclass), 'false'),
    coalesce((select ('security_invoker=false' = any (c.reloptions))::text from pg_class c where c.oid = 'public.business_directory'::regclass), 'false'))
union all select 'members can read them, anon cannot (expect true / false)',
  concat_ws(' / ',
    (has_table_privilege('authenticated', 'public.flat_directory', 'select') and has_table_privilege('authenticated', 'public.member_directory', 'select')
       and has_table_privilege('authenticated', 'public.business_directory', 'select'))::text,
    (has_table_privilege('anon', 'public.flat_directory', 'select') or has_table_privilege('anon', 'public.member_directory', 'select')
       or has_table_privilege('anon', 'public.business_directory', 'select'))::text)
union all select 'original text saved for the undo (expect 3)', (select count(*)::text from public.zz_mt10_view_backup);
