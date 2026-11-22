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
