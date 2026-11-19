-- FLAT_SETUP_SNAPSHOT.sql · READ ONLY. Changes nothing. Run any time (before and after FLAT_SETUP_TABLES.sql).
-- Purpose: a "before" picture of the flats' structure, to compare with "after". It lists NO owner names, mobiles or emails.
-- How: run each query below on its own (Supabase > SQL Editor shows only the last result of a script), and save the
--      result (Export > CSV, or copy). Keep the files outside this public repository (they are the society's own data).

-- 1. Totals per tower (expect: the same numbers before and after)
select coalesce(nullif(trim(tower), ''), '(none)') as tower,
       count(*)                      as flats,
       min(floor)                    as first_floor,
       max(floor)                    as last_floor,
       count(*) filter (where maintenance is null) as without_rate
  from public.flats
 group by 1
 order by 1;

-- 2. Structure of every flat (no personal data)
select id, tower, floor, flat_no, bhk, sqft, maintenance, status
  from public.flats
 order by tower, floor, flat_no, id;

-- 3. The columns of the flats table (so the setup screens use real column names)
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'flats'
 order by ordinal_position;

-- 4. Do the new setup tables exist yet? (false before FLAT_SETUP_TABLES.sql, true after)
select 'society_profile' as tbl, (to_regclass('public.society_profile') is not null)::text as exists_now
union all select 'towers', (to_regclass('public.towers') is not null)::text;
