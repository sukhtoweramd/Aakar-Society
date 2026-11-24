# Multi-tenancy · Stage 0 · what the repository shows (22 Nov 2026, commit 3e8e169)

Read from the code only. The live database is checked with `STAGE0_QUERIES.sql` (read-only, run by hand). No data in this file.

## Counts
| Item | In the repo | Note |
|---|---|---|
| SQL scripts | 56 root + 32 in `sql-security/` | |
| Tables created by scripts | 34 | Core tables (flats, members, notices, events …) are NOT created in any script: their base schema exists only in the live database. Query 1–4 extract it. |
| Row rules (`create policy`) | 127 | matches the plan |
| Views | 3 (`member_directory`, `flat_directory`, `business_directory`) | all `security_invoker = false`: they bypass row rules, so each needs an explicit society filter |
| Functions | 59 | security-definer ones also bypass rules |
| API routes | 13 | 8 use the server key (list below) |

Server-key routes: `flat-family`, `flat-plan`, `flat-remove`, `committee`, `payment-proof`, `residents`, `backup`, `docs`, plus `lib/serverAuth.ts` and `lib/backup.ts`.

## Things that will collide between societies (to fix in the design)
- `bills.bill_no` and `payments.receipt_no` are globally `unique` → must be unique per society.
- Flat ids such as `A101` are used as keys (`nominees.flat_id` is a text primary key; 15 `references flats` lines) → keys must include the society.
- `society_profile` is one row (id = 1) and `towers` is one set → one per society.
- Backups and restore (`restore_society_backup`) replace ALL records → must work per society.
- Login role and flat sit in `app_metadata` (`role`, `flat_id`, `tenant_flat`) → move to a memberships table.

## Next
Run the 10 queries, save the results outside the repo, and bring them back (or paste the column and constraint lists) so stage 1 can list every table that needs `society_id`.

---

# Live database findings (24 Nov 2026) · structure and counts only, no personal data

Queries run by the main admin in the Supabase SQL Editor: tables, columns, keys and links, functions, triggers, rules per table, grants, logins by role.

## Size and state
- 40 tables + 3 views, row rules on for every table. About 230 rows in all (91 flats, 32 members, the rest small).
- Real data: flats, members, committee members and areas of responsibility. Everything else is demo data. GO LIVE has not been pressed (`society_live` is empty), so test clearing is still open.
- 12 logins: 5 committee, 6 flat (resident), 1 tenant.
- Row counts from `pg_stat` were stale (showed 0); exact counts were used.

## Needs `society_id` (39 tables; not `zz_security_app_meta_backup`)
- One-row settings tables, to become one row per society: `app_settings`, `billing_settings`, `society_profile`, `help_guide`, `society_live` (keyed on `id` today).
- Keys to include the society: `flats.id`, `towers.code`, `nomination_status.flat_id`.
- 20 tables carry `flat_id` as text; 19 formal foreign keys point at `flats(id)`. Not formally linked today: `bookings`, `complaints`, `event_checkins`, `letter_requests`, `nominees`, `nomination_status`.
- Unique across the whole database today, to become per society: `bills.bill_no`, `payments.receipt_no`, `letters.ref_no`, `complaints.complaint_no`, `booking_areas.name`, `letter_templates.name`, `flats.flat_no`, `flats.edit_code` (edit_code is not used by the code; to be confirmed and probably dropped).
- `maintenance` and `businesses` (0 rows, not read by any screen): drop candidates, to be confirmed.
- Billing defaults hold Aakar's initials and the year (`AKR/26-27/` and similar).

## Rules, functions, triggers, grants
- 121 live row rules (the 127 in the repo counts replaced versions). Suggested: one RESTRICTIVE rule per table (society_id = active society), ANDed with the existing rules (PostgreSQL docs, CREATE POLICY). To be tried on a test copy first.
- 59 functions, 51 SECURITY DEFINER (bypass row rules; each needs its own society check). About 16 role helpers first (`is_committee`, `is_main_admin`, `my_flat`, `my_home_flat`, `my_tenant_flat` …), then the actions, numbering (`next_doc_numbers`), backup / restore, and `utr_already_reported` (global or per society: to decide).
- 14 triggers on 12 tables. Complaint numbers come from a trigger; bill / receipt numbers from `next_doc_numbers`.
- `anon` has no grants anywhere. `authenticated` has all 7 privileges (incl. TRUNCATE, TRIGGER, REFERENCES) on 42 objects: suggested to revoke the last three in stage 1.
- The 3 directory views are `security_invoker = false`: each needs an explicit society filter.
