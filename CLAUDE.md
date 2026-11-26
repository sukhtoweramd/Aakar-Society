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
- Tenant logins (TENANT_LOGINS.sql, 30 Oct 2026): `role = 'tenant'` + `app_metadata.tenant_flat` (never `flat_id`, so `my_flat()`
  and every owner rule ignore them). Database: `my_tenant_flat()` (only while `flat_tenant_logins` row active AND flat rented),
  `my_home_flat()` = owner or tenant flat. Server: `Authed.isTenant` / `tenantFlatId` (flatId stays null). A tenant may use only
  what is opened on purpose: family / vehicles / emergency contacts, complaints, common plot booking, notices, events, contacts.
- Head of family (`members.is_head`) is fill-once for flat logins too (`sql-security/06`): name, head flag and removal by committee only.
- Committee flag + top designation are on the flat; `flats.committee_members` lists every person of the flat on the committee with their own designation (COMMITTEE_PEOPLE.sql; empty = `committee_person` or the owner). Use `committeePeople(f)` / `committeeText(f)`; members get the list via `committee_people()`.
- Bookings are approved only by a committee login linked to the flat marked exactly "Chairman" or "Secretary".
- Main admin only (server checks, not just hidden buttons): add / reset / link / remove committee logins (PR-14); remove a flat login,
  revoke a tenant login, create several flat logins at once, clear a whole flat's family (`/api/flat-family`) (PR-15); backup download / restore;
  delete bills, receipts, letters; GO LIVE / clear test. Server check: `lib/mainAdmin.ts` (follows MAIN_ADMIN_EMAIL). Committee logins are
  created only for the Chairman and Secretaries.

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

## Flat setup (Nov 2026)
- `society_profile` (one row) and `towers` hold what used to be typed into `lib/society.ts` (`SOCIETY`, `TERRACE_TOWERS`); the app reads them after login
  (`page.tsx` -> `loadSetup`, helpers in `lib/societySetup.ts`) and applies the profile to `SOCIETY` in place. No row / unreadable table = today's values.
  A row with a name and full name is used as it is: an empty field stays empty, it never falls back to Aakar's value.
- ADMIN -> FLAT SETUP: `FlatSetupPanel.tsx` (view, never writes) + `SetupEditors.tsx` (edit society details and towers). Who may save is decided by the
  database (`is_main_admin()` in the table rules); with flats present, tower code, terrace and on/off are locked (screen) and code change / delete are blocked (trigger).
- Society name, address, registration, city and building on printed papers (bills, receipts, letters, notices, stamp, flat card, directories, login slips, event pass) and on the login / cover screens
  come from `SOCIETY` (the profile) through helpers in `lib/society.ts` (`societyTitle`, `addressOneLine`, `addressWithPin`, `titleCase`, `nameLines`, `nameSuffix`, `regYear`). Never type them into a screen or a print template;
  `tests/societyWording.test.ts` fails if they come back. The stamp is `defaultStamp()` (built when used). WhatsApp / message texts, the HELP assistant prompt, download file names and the committee-login message also come from the profile (`societyShort`, `societyAppName`, `fileSlug`, `siteUrl`;
  the app's web address is `society_profile.public_url`). Not moved (plain files, edited once per society's own copy): app name / tab title / manifest / icons / offline page / service worker name.
- Flat generator (`FlatGenerator.tsx`, `lib/flatPlan.ts`, `POST /api/flat-plan`): only while the society has NO flats, main admin only (server check); the server rebuilds the
  list from the tower numbers and undoes its insert on error. Flat id = tower letter + floor + 2 digits (A101). Writes only id, tower, floor, flat_no, maintenance (other columns keep
  their database defaults; not yet tried on a second Supabase project). The joined-home login rule (B202 -> B201) is the setting `FLAT_RULES` in `lib/residents.ts` (Aakar: joinedLetters ["B"], separate B101/B102;
  a society with no joined homes sets `joinedLetters: []`). The generator and `/api/flat-plan` refuse a joined tower with 2+ flats per floor.
- Flats can also be added later for a tower that has NO flats (a new tower D), same screen; flat numbers may be typed floor by floor (`layout` in `lib/flatPlan.ts`). The server refuses a tower
  that already has flats and any number that already exists. Removing flats (`FlatRemover.tsx`, `/api/flat-remove`, main admin only) works only when the database function
  `flat_blockers()` (`sql-security/15`, run by hand; server key only) says every chosen flat holds no data; the server checks again right before deleting.

## HELP assistant (Nov 2026)
- `app/api/help/route.ts` answers from the written guide. For a plain flat login (not committee, not tenant) asking about its own amounts (`wantsOwnMoney`), it also reads that flat's bills and payments through the member's own client (database rules apply, no server key) and adds a short summary (`duesFacts`, `lib/helpData.ts`) to the prompt. A committee login asking about the whole society's dues (`wantsSocietyDues`) gets `societyDuesFacts`: flat ids, owner names and amounts (no phone numbers or bank balances), read in pages through the committee's own client. A flat or tenant login asking about its own complaints, bookings or letter requests (`wantsOwnRecords`, `recordsFacts`) gets a short summary read through its own client, filtered to its home flat (tenants get no letter requests). A plain flat login asking which documents are still to upload gets `docsFacts` (its own `flat_docs` types against the list in `lib/flatDocTypes.ts`). Never widen these to other tables or to other kinds of login without a server-side check of who is asking.

## Multi-tenant (Nov 2026, in progress - see `multitenant/`)
- Step 2-3 scripts (run by hand, after a full backup, MT_01 then MT_02; each has an `_UNDO`): `societies` + `society_memberships` (platform tables, NOT society data, so not in
  `BACKUP_TABLES` / restore on purpose) and a `society_id uuid not null default <Aakar id>` column on every society table. Nothing reads `society_id` yet; Aakar behaves as before.
- A new society table must also get `society_id` (same default pattern until step 4 replaces the default) and be added to the list in `MT_02_SOCIETY_ID.sql`; `tests/multitenantScripts.test.ts` checks the backup list against it.
- Step 4b (MT_04, wall on every society table) is live on Aakar (24 Nov 2026). Step 4c is split into small scripts, each tried on the test project (aanganone) first, each with `_TEST` and `_UNDO`:
  MT_05 = numbers / names unique per society (bill, receipt, letter, complaint numbers, area and template names, flat_no, edit_code, one maintenance bill / one tenant login per flat) and complaint numbers counted per society.
  MT_06 = the five one-row settings tables (billing_settings, app_settings, society_profile, help_guide, society_live) keyed `(society_id, id)` (id stays 1); every database function saying `where id = 1` on them is rewritten from its live text to
  `where society_id = public.current_society_or_first() and id = 1` (`current_society_or_first()` = the login's society, Aakar's for server-key calls; TEMPORARY, 4d replaces it with an explicit society). A NEW function that updates one of these tables must filter by society the same way.
  MT_07 = keys of flats `(society_id, id)`, towers `(society_id, code)`, nomination_status `(society_id, flat_id)`; every foreign key to flats is remade as `(society_id, flat col) -> flats (society_id, id)` (found from the live database, same names / rules;
  `ON DELETE SET NULL (col)`, PostgreSQL 15+); `flats_tower_check` dropped; functions `towers_guard` and `nominees_changed` rewritten from their live text. MT_05 / MT_06 / MT_07 are live on Aakar (24 Nov 2026).
  RULE after MT_07: never write `on conflict (id)` / `upsert` on flats, towers, nomination_status or the five settings tables, and never look a flat up by id alone in a SECURITY DEFINER function or a view without the society (step 4d fixes the existing ones). A second society must not reuse flat ids on the real database before 4d is done.
  MT_08 = the `society_id` default on all 39 society tables is `public.current_society_or_first()` (the login's society; Aakar's for server-key calls, TEMPORARY until 4d) instead of Aakar's id written out; an insert that names its society is untouched.
  A NEW society table gets `society_id uuid not null default public.current_society_or_first() references public.societies(id)` (and goes into the lists in MT_02 / MT_04 / MT_08). MT_05 - MT_08 are all live on Aakar (24 Nov 2026), so step 4c is complete; next is 4d (read `multitenant/STEP4D_INVENTORY.md` first; `STEP4D_QUERIES.sql` is a read-only query that lists the live functions and views).
  Step 4d (society checks in functions / views / routes) goes in small scripts, each tried on aanganone first: MT_09 = `clear_test_documents(.., p_society)` and `restore_society_backup(p, p_society)` act on ONE society (rewritten from live text; `p_society` left out = Aakar's, so today's routes keep working; the routes pass the caller's society in the next app PR). MT_09 is live on Aakar and aanganone (24 Nov 2026). The routes `/api/docs` and `/api/backup` (PR `feat/mt-4d1-routes`) pass the caller's society (`societyOfCaller`) to every read / write / `clear_test_documents` / `restore_society_backup`, because the server key skips the database wall: a NEW server route that uses `getAdminClient()` must name the society in every query (and in `logAccess`). Backups: the first society keeps `backups/<name>.json`, others use `backups/<society id>/` (`lib/backupScope.ts`); a backup file restores only into the society it came from. Test files in R2 are deleted only for the first society until file folders are per society. NEVER run `MT_09_TEST.sql` on live (it clears Aakar's test documents inside the test). MT_10 = the three directory views (`flat_directory`, `member_directory`, `business_directory`) show only `active_society()`'s rows and join members / flats on (society, flat id); they return NO rows in the SQL Editor (no login), by design. NEVER run `MT_10_TEST.sql` on live. MT_11 (flat lookups; `MT_11_FLAT_LOOKUPS.sql`, `_UNDO`, `_TEST`): 11 owner-rights functions (`flat_is_rented`, `flat_has_tenant_login`, `my_tenant_flat`, `can_assign_areas`, `area_rights`, `can_approve_letters`, `can_approve_booking`, `my_flat_is_committee`, `committee_people`,
  `flat_people_counts`, `bill_is_tenant`) look in `(select public.active_society())` (strict: a login with no society finds nothing; `area_rights` no longer uses `current_society_or_first()`). `my_home_flat`, `can_set_booking_charge`, `my_flat` are unchanged on purpose.
  `flat_blockers(p_flats, p_society default null)` (server key only; left out = Aakar's) counts only that society's rows and skips the `society_id` column of the composite keys (the old text failed with "uuid = text" since MT_07). Rewritten from live text like MT_09; originals in `zz_mt11_function_backup`.
  `/api/flat-remove` (same PR) names the caller's society in every read / write / `flat_blockers` / access-log row: run MT_11 on a database BEFORE the app that passes `p_society` reaches it. NEVER run `MT_11_TEST.sql` on live (it moves the committee login to another society, rolled back).
  MT_12 (`MT_12_BOOKING_ACTIONS.sql`, `_UNDO`, `_TEST`): the five booking actions (`booked_slots`, `request_booking`, `cancel_booking`, `decide_booking`, `set_booking_charge`) look in `(select public.active_society())` (strict: a login with no society finds nothing); `decide_booking` writes its notice, bill and bill counter under `b.society_id` (the booking's society), not the fallback. Rewritten from live text like MT_11; originals in `zz_mt12_function_backup`. Needs MT_11 first. NEVER run `MT_12_TEST.sql` on live.
  MT_13 (`MT_13_EVENT_ACTIONS.sql`, `_UNDO`, `_TEST`): the eight event actions (`my_event_role`, `gate_pass`, `gate_undo`, `register_for_event`, `set_event_registration`, `set_event_money_settings`, `submit_event_payment`, `verify_event_payment`) look in `(select public.active_society())` (strict); another society's event / registration gives "Event not found." / "Registration not found."; check-ins, registrations and event money rows name their society; the cash taker's flat is looked up in the registration's society. Rewritten from live text; originals in `zz_mt13_function_backup`. Needs MT_11 first. NEVER run `MT_13_TEST.sql` on live.
  MT_14 (`MT_14_COMPLAINT_LETTER_ACTIONS.sql`, `_UNDO`, `_TEST`): the eight actions `update_complaint`, `reassign_complaint`, `withdraw_letter_request`, `mark_my_action_done`, `my_action_points`, `my_committee_meetings`, `my_meeting`, `utr_already_reported` look in `(select public.active_society())` (strict); another society's complaint / area gives "Complaint not found." / "Area not found.", a request or action point gives the usual "not yours" message, `my_meeting` gives nothing; the payment reference check sees only this society's reports and payments. Rewritten from live text; originals in `zz_mt14_function_backup`. Needs MT_11 first. `storage_stats()` is left unchanged on purpose (database-wide sizes and row counts, no names or data) until the platform-owner screen. NEVER run `MT_14_TEST.sql` on live.

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
- GitHub Actions secrets (Repository > Settings > Secrets and variables > Actions; not Vercel), used only by
  `.github/workflows/supabase-keepalive.yml` (daily keep-alive, 11 Nov 2026): AAKAR_SUPABASE_URL, AAKAR_SUPABASE_PUBLISHABLE_KEY
  (publishable / anon key only; never the secret or service-role key). It calls `public.keepalive()` (KEEPALIVE.sql, returns 1, reads no data).
- Keep this list updated whenever a new variable is added.
