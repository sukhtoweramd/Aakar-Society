# Order of the SQL scripts for a NEW database (the "aanganone" copy) — 24 Nov 2026

Status: **PROVEN on an empty Supabase project ("aanganone", 24 Nov 2026)** with the corrections below: every script ran and every check matched.
Built from each script's "run after" header and from which tables and functions it needs, then corrected by the first full run.
Aakar's live database already has all of this; do not re-run these there.

Every script is run by hand in the Supabase SQL Editor. After each one compare its check result with its own header.

## Not for a new society (Aakar-only data fixes, leave out)
`RENUMBER_B_C.sql`, `SPLIT_B101_B102.sql`, `FIX_4BHK_LABEL.sql`, `sql-security/01_COMMITTEE_ROLE_set.sql` (it expects exactly one role-less login,
which only Aakar had), every `*_UNDO.sql`, and the read-only checks (`FLAT_SETUP_SNAPSHOT.sql`, `KEEPALIVE_CHECK.sql`, `sql-security/00*_read_only.sql`; run these any time).
`KEEPALIVE.sql` is only needed if a keep-alive job is set up for that project.

## Order
| # | Script | Why here |
|---|---|---|
| 0 | `multitenant/BASE_TABLES.sql` | the six core tables (flats, members, notices, events, businesses, maintenance); the original base script is not in the repo |
| 1 | `RESIDENT_ACCESS.sql` | defines `is_committee()` and `my_flat()` and the rules on the core tables (needs 0) |
| 2a | **first committee login** (Authentication > Users > Add user, auto-confirm), then in the SQL Editor: `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) \|\| '{"role":"committee"}'::jsonb where email = '<that email>';` | script 02 refuses to run while no login has the committee role |
| 2 | `sql-security/02_IS_COMMITTEE_strict.sql` | `is_committee()` reads `app_metadata.role` |
| 3 | `MEMBER_SCREENS.sql` | creates `app_settings` (needed by contacts, areas) |
| 4 | `COMMITTEE_ROLES.sql`, `COMMITTEE_PERSON.sql`, `COMMITTEE_PEOPLE.sql` | flat columns for committee roles (in this order) |
| 5 | `PRE_PHASE2_A.sql` | emergency contacts, vehicles, flat documents |
| 6 | `DOB.sql`, `BANNERS.sql` | extra columns on members / notices. **Do NOT run `DIRECTORY_CONSENT.sql` and `TENANTS.sql` on a new database:** their columns are already in BASE_TABLES, `COMMITTEE_ROLES.sql` already made the newer directory views (they fail with "cannot drop columns from view"), and TENANTS would put back an older, weaker flat guard |
| 7 | `BILLING.sql` | billing settings, bills, payments, signatories, `next_doc_numbers()` |
| 8 | `BACKUP_RESTORE.sql` | access log, society_live, backup/restore base |
| 9 | `BILL_DUPLICATE_GUARD.sql`, `BILLING_ANNUAL.sql` | |
| 10 | `LETTERS.sql`, `LETTER_REQUESTS.sql` | |
| 11 | `PAYMENT_REPORTS.sql`, `PAYMENT_AI.sql` | |
| 12 | `COMMITTEE_AMC.sql`, `COMPLAINTS.sql`, `AREAS_BACKUPS.sql` | defines `is_main_admin()`, `can_assign_areas()` |
| 13 | `LETTER_TEMPLATES.sql`, `RESOLUTION_REQUESTS.sql`, `RESOLUTION_FORMAT.sql` | needs letters, requests, areas |
| 14 | `MINUTES.sql`, `EVENT_COMMITTEES.sql`, `EVENT_REGISTRATION.sql`, `EVENT_CHECKINS.sql` | meetings and events (in this order) |
| 15 | `NOMINEES.sql` | `flat_is_rented()` |
| 16 | `HELP_GUIDE.sql`, `STORAGE_STATS.sql`, `CONTACTS.sql` | |
| 17 | `BOOKINGS.sql`, `TENANT_LOGINS.sql` | `my_home_flat()`, `my_tenant_flat()` |
| 18 | `EVENT_ASSISTING.sql`, `BOOKING_CHARGES.sql` | need tenant logins and bookings |
| 19 | `FLAT_SETUP_TABLES.sql` | society_profile, towers |
| 20 | `sql-security/05`, `06`, `11`, `12`, `13`, `15` (in number order) | flat-login guards, head of family, clear-test, flat-empty check |
| 21 | `sql-security/14_RESTORE_flat_setup_tables.sql` | the final restore function; run last of the sql-security scripts |
| 22 | `GRANTS_ALL.sql` | re-applies grants to every table |
| 23 | `multitenant/MT_01_SOCIETIES.sql`, then `MT_02_SOCIETY_ID.sql` | the multi-tenant columns |

`sql-security/03, 04, 07, 08, 09, 10` are older restore lists; script 14 replaces them, so a new database only needs 14.

## Found while reading (to decide before step 4)
- **Flat-login email is fixed to Aakar:** `lib/residents.ts` (`RESIDENT_DOMAIN = flats.aakarsociety.app`) and `app/api/committee/route.ts`.
  Logins are `a101@<domain>`; two societies both having A101 would clash (an email can exist once). Needs a per-society part in the address.
- **One-row / short-key tables:** `society_profile` allows only `id = 1`; `towers` and `flats` use `code` / `id` alone as the key;
  `app_settings`, `billing_settings`, `society_live` hold one shared row. These need `(society_id, ...)` keys in step 4.
- **Unique numbers that are global today:** `bills.bill_no`, `payments.receipt_no`, `letters.ref_no`, `complaints.complaint_no`,
  `flats.flat_no` / `edit_code`, `booking_areas.name`, `letter_templates.name`. Each becomes per society.
- `flats_tower_check` (A, B, C only) must be dropped for a society with other tower codes.

## Found by the first full run (24 Nov 2026)
- `FLAT_SETUP_TABLES.sql` also **inserts Aakar's real society profile** (name, registration, address, web address) into any database where it runs; its starter towers come from the flats. For a new society that seed must be a separate Aakar-only script.
- Starter data that is Aakar's own and lands in every new database: letter prefix `AKR/L/26-27/` (LETTERS.sql), 10 committee areas (COMMITTEE_AMC.sql), 4 booking areas
  "Tower A area / Center area / Tower B area / Main common area" (BOOKING_CHARGES.sql), 6 letter formats and 1 resolution format, the help guide text.
- **Restore is not society-safe:** `restore_society_backup` runs `delete from <table> where true` on every table, and accepts only files labelled `aakar-society`.
  With two societies it would wipe the other one. Step 4 must scope the delete and the file label to one society.
- `sql-security/12_CLEAR_TEST_ALL.sql` (clear test) also clears tables without a society filter; same fix.
- A fully built database has 39 society tables + 3 directory views (checked by GRANTS_ALL.sql: 42 rows, all closed to visitors).

## Step 4d-3 (25 Nov 2026): MT_11 flat lookups
- `MT_11_FLAT_LOOKUPS.sql` after MT_10: the flat / bill / committee lookup functions look in the login's society; `flat_blockers` takes a society. Check table: 11 / yes / yes / true / false / 12. `MT_11_UNDO.sql` puts every function back.
- `MT_11_TEST.sql` on the TEST project only (aanganone): lines 1 - 20 and `21 overall: PASS`. Never on live.
- Run MT_11 on a database BEFORE the app version with the new `/api/flat-remove` is live on it (the route passes `p_society`).
