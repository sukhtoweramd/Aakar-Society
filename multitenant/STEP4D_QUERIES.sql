-- STEP4D_QUERIES.sql (Nov 2026) - READ ONLY. Lists what step 4d has to change. Changes nothing; safe on the test project and on live Aakar.
-- Run each block on its own in the Supabase SQL Editor and paste the result rows. (Block 1 is the long one: about 60 rows.)

-- Block 1: every function in the public schema: runs with owner rights?  trigger?  already names society_id?  which society tables it reads or writes.
select p.proname as function_name,
       case when p.prosecdef then 'DEFINER' else 'invoker' end as runs_as,
       case when p.prorettype = 'trigger'::regtype then 'trigger' else '' end as kind,
       case when p.prosrc ~* 'society_id|active_society|current_society_or_first' then 'yes' else 'NO' end as names_society,
       (select string_agg(t, ',' order by t) from unnest(array['access_log','amc_contracts','amc_visits','app_settings','billing_settings','bills','booking_areas','bookings','businesses','committee_areas','complaints','emergency_contacts','event_checkins','event_money','event_registrations','event_team','events','flat_docs','flat_tenant_logins','flats','help_guide','letter_requests','letter_templates','letters','maintenance','meeting_actions','meetings','members','nomination_status','nominees','notices','payment_reports','payments','signatories','society_contacts','society_live','society_profile','towers','vehicles']) t where p.prosrc ~* ('(^|[^a-z_])' || t || '([^a-z_]|$)')) as society_tables_used
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
 order by (not p.prosecdef), p.proname;

-- Block 2: the directory views (owner rights = they bypass the society wall): their current text.
select c.relname as view_name, coalesce(array_to_string(c.reloptions, ','), '') as options, pg_get_viewdef(c.oid, true) as definition
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' order by c.relname;

-- Block 3: policies other than the society wall that name a function from block 1 (so a function change reaches the table rules too).
select schemaname || '.' || tablename as tbl, policyname, permissive, cmd
  from pg_policies where schemaname = 'public' and policyname <> 'society_wall'
   and (coalesce(qual, '') || coalesce(with_check, '')) ~* 'my_flat|my_tenant_flat|my_home_flat|is_committee|is_main_admin|can_|flat_is_rented'
 order by tbl, policyname;

-- Block 4 (MT_11): the live text of the group B functions (flat lookups), one row each, line breaks flattened so it pastes as a table.
-- Read only. Function code is not residents' data (the same code is in this repo), so the rows are safe to paste.
select p.proname as function_name,
       case when p.prosecdef then 'DEFINER' else 'invoker' end as runs_as,
       regexp_replace(pg_get_functiondef(p.oid), '\s*\n\s*', ' ', 'g') as live_text
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
   and p.proname in ('flat_is_rented','flat_has_tenant_login','my_tenant_flat','my_home_flat','my_flat','can_assign_areas','area_rights',
                     'can_approve_letters','can_approve_booking','my_flat_is_committee','committee_people','flat_people_counts',
                     'bill_is_tenant','can_set_booking_charge','flat_blockers')
 order by p.proname;
