-- Login banners: a notice can be shown as a large banner right after login.
-- Run once in Supabase > SQL Editor. Safe to run again.
alter table public.notices add column if not exists is_banner boolean not null default false;
alter table public.notices add column if not exists banner_until date;   -- optional: banner switches off after this date

-- Check: should list the two new columns
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'notices' and column_name in ('is_banner', 'banner_until');
