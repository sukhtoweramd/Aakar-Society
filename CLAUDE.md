# Notes for working on this repo

## SQL scripts (Supabase)
- From 30 Oct 2026 Supabase no longer gives new `public` tables automatic access for the website (Data API).
  Every script that creates a table must, in the same script: enable RLS, add its policies, `revoke all ... from anon`,
  and `grant select, insert, update, delete ... to authenticated, service_role` (views: `grant select`).
  New sequences: `grant usage, select ... to authenticated, service_role`.
- `GRANTS_ALL.sql` re-applies these grants to every table; safe to run again (e.g. after a restore).
- Scripts are run by hand in the Supabase SQL Editor: keep them safe to re-run, and end with a short check query.

## Who is committee (Oct 2026)
- A login is committee only if `app_metadata.role = 'committee'`; flat logins have `role = 'resident'` + `flat_id`.
  No role = no access. Code: `lib/roles.ts`; database: `is_committee()` (reads `auth.users`, see `sql-security/02`).
- New committee logins get the role from ADMIN → committee logins (`/api/committee`); never create logins in the
  Supabase dashboard without setting the role. Public sign-up and anonymous sign-in stay OFF.
- Security changes go in `sql-security/` as numbered scripts, each with a check and an `_UNDO`.
- Flat row (`flats`) for a flat login is an allow-list (`sql-security/05`, "fill once"): mobile, email, address, tenant dates and
  directory consent any time; owner / tenant name only while empty; everything else (incl. occupancy and any new column)
  committee only. A new member-editable column must be added to the guard's list on purpose.
- Head of family (`members.is_head`) is fill-once for flat logins too (`sql-security/06`): name, head flag and removal by committee only.
- Committee flag + top designation are on the flat; `flats.committee_members` lists every person of the flat on the committee with their own designation (COMMITTEE_PEOPLE.sql; empty = `committee_person` or the owner). Use `committeePeople(f)` / `committeeText(f)`; members get the list via `committee_people()`.
- Bookings are approved only by a committee login linked to the flat marked exactly "Chairman" or "Secretary".

## Files in R2 (Oct 2026)
- Screens never show a file by its public R2 address. They ask `POST /api/file/link` (login checked) for a short-lived
  signed link: 10 minutes for pictures and lists, 2 minutes for a file opened with a click. Client: `lib/fileLinks.ts`
  (`openFile`, `useFileLink`) and `app/ledger/SecureFile.tsx` (`<FileLink>`, `<SecureImg>`); server: `lib/r2Access.ts`.
- Who may open what: `lib/r2Keys.ts` (`folderAccess`). Minutes and event papers attached to a meeting / event entry are
  also opened by members who can see that row (checked through their own database rules). A new folder is committee-only
  until a rule is added there.
- Rows keep the stored form (old public address or key); both are read as the key. `R2_PUBLIC_URL` stays set after the
  bucket is made private: it is only used to recognise old links.
- Payment screenshots (`payproofs/`) and backups (`backups/`) never go through these routes.

## Screens (Oct 2026)
- Most members use the app on phones: build every new screen for a phone first (about 390 px wide): cards instead of
  wide tables, buttons at least ~44 px tall, text boxes use `.field` (16 px on phones so iPhones don't zoom).
  A wide table goes inside its own `overflow-auto` box, and grid children get `min-w-0`, so the page never scrolls sideways.

## Tests (Oct 2026)
- CI runs `npm test` on Node 20, where creating the Supabase client fails. A test must import only files that do not
  import `lib/supabaseClient` (put pure helpers in their own file, e.g. `lib/maintenance.ts`, `lib/areaRules.ts`, `lib/contacts.ts`).

## Areas of responsibility (Oct 2026)
- One responsible member (`holder_flat`) + backups (`backup_flats`, max `app_settings.area_backup_limit`); `backup_flat` = first backup.
- Database guard `committee_areas_guard` (AREAS_BACKUPS.sql): areas themselves = main admin (`is_main_admin()`, oldest committee
  login); people = Chairman/Secretary committee login or main admin (`can_assign_areas()`). Complaints go to holder + all backups.

## Never in this repo (it is public)
- Real keys, passwords or residents' data. Keys live only in Vercel environment variables.
- Screenshots and mock-ups use sample data only.

## Before merging (security checklist, from the audit of 25 Oct 2026)
1. Every value from the database printed into HTML (print windows, PDFs, `document.write`) goes through `esc()`.
2. Uploaded files: the server sets the file type from the extension, never from the browser (`file.type`).
3. A new table: RLS + rules + grants in the same script, AND added to `BACKUP_TABLES` (`lib/backup.ts`) and to the
   restore function in a new `sql-security/` script (test `tests/restoreTables.test.ts` checks this).
4. A new API action: who may call it (flat / committee / main admin) is checked on the server, not only by hiding a button.
5. No keys or passwords in any file, including `.env.example`, old HTML and comments.

## Handover document (requested 21 Oct 2026 — prepare at project completion)
- One-page technical document for the committee: services used (Vercel, Supabase, Cloudflare R2 + Workers AI, GitHub),
  and every Vercel environment variable: its NAME, what it is for, and where to get it (site + screen). Never the values.
- Current variables read by the code: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID / CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME, R2_PUBLIC_URL / CLOUDFLARE_R2_PUBLIC_URL, MAIN_ADMIN_EMAIL, CLOUDFLARE_AI_TOKEN (Workers AI, reads "I have paid" screenshots; added 21 Oct 2026).
- Keep this list updated whenever a new variable is added.
