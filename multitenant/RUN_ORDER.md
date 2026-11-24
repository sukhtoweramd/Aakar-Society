# Order of the SQL scripts for a NEW database (the "aanganone" copy) — 24 Nov 2026

Status: **LIKELY, not yet proven.** Built from each script's "run after" header and from which tables and functions it needs
(read from the files, not run). The first full run on the empty copy will confirm or correct it; fix this list then.
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
| 2 | `sql-security/02_IS_COMMITTEE_strict.sql` | `is_committee()` reads `app_metadata.role` |
| 3 | `MEMBER_SCREENS.sql` | creates `app_settings` (needed by contacts, areas) |
| 4 | `COMMITTEE_ROLES.sql`, `COMMITTEE_PERSON.sql`, `COMMITTEE_PEOPLE.sql` | flat columns for committee roles (in this order) |
| 5 | `PRE_PHASE2_A.sql` | emergency contacts, vehicles, flat documents |
| 6 | `DIRECTORY_CONSENT.sql`, `TENANTS.sql`, `DOB.sql`, `BANNERS.sql` | extra columns on flats / members / notices |
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
