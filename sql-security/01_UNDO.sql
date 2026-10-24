-- 01_UNDO · Put the committee logins' app_metadata back exactly as it was before 01.
-- Only needed if something went wrong. If 02 has been run, run 02_UNDO first.
update auth.users u set raw_app_meta_data = b.raw_app_meta_data
  from public.zz_security_app_meta_backup b where u.id = b.user_id;

-- Check: shows the restored values
select u.email, coalesce(u.raw_app_meta_data ->> 'role', 'NONE') as role
from auth.users u join public.zz_security_app_meta_backup b on b.user_id = u.id order by u.email;
