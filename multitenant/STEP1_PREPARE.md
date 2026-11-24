# Multi-tenancy · Step 1 · prepare (24 Nov 2026)

No data in this file. Nothing here changes the live database.

## 1. What CLEAR TEST DOCUMENTS removes (read from `app/api/docs/route.ts` and `sql-security/12_CLEAR_TEST_ALL.sql`)
- Allowed only before GO LIVE (`society_live` empty) and only by the main admin. The app first saves a backup to R2 and refuses to clear if R2 is not set up.
- Removes all rows in 19 tables: payment_reports, payments, bills, letter_requests, letters, event_checkins, event_registrations, event_money, event_team, meeting_actions, meetings, events, complaints, bookings, notices, amc_visits, amc_contracts, nominees, nomination_status.
- Also deletes files in R2 folders `notices/ events/ eventdocs/ minutes/ complaints/ amc/ payproofs/`. Never touches `flats/ vault/ floor-plans/ backups/`.
- Bill, other-bill, receipt and letter numbers are set to the "last paper number" typed in; complaint numbers restart.
- NOT removed: flats, members, vehicles, emergency_contacts, flat_docs, businesses, committee_areas, society_contacts, booking_areas, letter_templates, signatories, billing_settings, help_guide, logins, maintenance, access_log, flat_tenant_logins.
- Live counts of what it will NOT remove (24 Nov): vehicles 3, emergency_contacts 2, society_contacts 2, flat_tenant_logins 1, access_log 17. Decide by hand: keep or delete.

## 2. Backup checklist (before anything)
1. Sign in as the main admin: ADMIN > BACKUP & RESTORE > DOWNLOAD FULL BACKUP.
2. Save the file OUTSIDE this repository (it holds real members' details). Keep a second copy on a society drive. Do not email it.
3. Check the file: counts match the database (flats 91, members 32, committee_areas 10 on 24 Nov).
4. Clear test data only after step 3. The app also saves its own copy to R2 first.
5. After clearing: flats 91, members 32, committee_areas 10 must be unchanged; the 19 tables above must show 0.

## 3. The repository cannot build a fresh database (finding)
- The first-ever setup script (`SUPABASE_SETUP.sql`) was removed in the Oct 2026 audit, and git history here is one commit, so it cannot be recovered.
- Six core tables are created by no script in the repo: flats, members, notices, events, businesses, maintenance.
- No file records the order in which the 56 scripts were run.
- So the `aanganone` test copy, and every new society later, needs a BASE SCHEMA script rebuilt from the live database, then the scripts in a worked-out order.

## 4. Information still needed to rebuild the base schema (structure only)
- H1: columns with defaults for the six core tables.
- H2: check constraints, indexes and row rules for the six core tables.
