# Step 4d inventory (24 Nov 2026) - what must check "which society is asking"

Status: FIRST-PASS TRIAGE from the repo's SQL and code, read by name and by the society tables each function touches.
Not yet confirmed against the live database (run `STEP4D_QUERIES.sql`, read-only) and not every function body has been read.
Nothing here changes any database. Aakar has one society, so none of this is a bug today; it matters the moment a second society exists.

## Why it is needed
The society wall (MT_04) stops a logged-in login from reading or writing another society's rows **through the tables**. Three things skip the wall:
1. database functions that run with owner rights (`SECURITY DEFINER`),
2. the three directory views (`security_invoker = false`),
3. server routes that use the server key.
Since MT_07 a flat id is only unique inside a society, so "look the flat up by id" is ambiguous in any of the three.

## 1. Database functions: 50 `SECURITY DEFINER` found in the repo (live count may differ by one or two)

| Group | Count | What is wrong in a second society | Fix (proposed) |
|---|---|---|---|
| A. Already society-aware | 6 | nothing: `is_committee`, `is_main_admin`, `complaint_before_insert` (MT_05), `towers_guard`, `nominees_changed` (MT_07), `next_doc_numbers` (MT_06, uses the temporary fallback) | only the temporary fallback is replaced at the end |
| B. Look a flat up by id | 14 | pick the wrong society's flat: `flat_is_rented`, `flat_has_tenant_login`, `my_tenant_flat`, `my_home_flat`, `can_assign_areas`, `area_rights`, `can_approve_letters`, `can_approve_booking`, `my_flat_is_committee`, `committee_people`, `flat_people_counts`, `flat_blockers`, `bill_is_tenant`, `can_set_booking_charge` | add `society_id = active_society()` to each lookup |
| C. Actions that take an id from the caller | 22 | a member of society B could pass an id that belongs to society A: `request_booking`, `cancel_booking`, `decide_booking`, `set_booking_charge`, `booked_slots`, `update_complaint`, `reassign_complaint`, `withdraw_letter_request`, `mark_my_action_done`, `my_action_points`, `my_committee_meetings`, `my_meeting`, `gate_pass`, `gate_undo`, `my_event_role`, `register_for_event`, `set_event_registration`, `submit_event_payment`, `verify_event_payment`, `set_event_money_settings`, `utr_already_reported` (duplicate check across ALL societies), `storage_stats` | refuse unless the row's society is the caller's |
| D. Triggers that read other tables | 6 | look at rows of other societies: `committee_areas_guard`, `tenant_moved_out`, `event_team_tenant_guard`, `letter_request_before_insert`, `letter_request_guard`, `letters_resolution_guard` | filter by the row's own `society_id` |
| E. Whole-database operations | 2 | **`clear_test_documents` deletes and `restore_society_backup` replaces the rows of EVERY society** | take an explicit `p_society` argument, touch only that society's rows |

Groups B, C, D: the fix needs each function's live text; changes will be small and per function (not one generic rewrite), each with a test that tries to cross societies.
Group E is the most dangerous and goes first.
Design to confirm: a function called by a logged-in member uses `active_society()` (strict: nobody logged in = no rows); a function called by the server names the society explicitly. `current_society_or_first()` (the fallback to Aakar) is then removed.

## 2. Directory views: 3
`member_directory`, `flat_directory`, `business_directory` (all `security_invoker = false`, so any member can read every society's rows through them).
Fix: add `where <table>.society_id = (select public.active_society())` to each view and join members / flats on `(society_id, flat id)`. Current text comes from block 2 of `STEP4D_QUERIES.sql`.

## 3. Server routes that use the server key: 8 files (+ `lib/backup.ts`, `lib/mainAdmin.ts`)
| Route | Today | Needs |
|---|---|---|
| `/api/committee` | `listUsers` over ALL logins; creates the membership in the caller's society (done in PR for step 4b) | list and look up only logins of the caller's society (through `society_memberships`) |
| `/api/residents` | same (flat and tenant logins) | same |
| `/api/backup` (+ `lib/backup.ts`) | backup file of all tables; restore via `restore_society_backup`; label says Aakar | backup / restore of the caller's society only; label from the society profile |
| `/api/docs` | GO LIVE / clear test via `clear_test_documents`; reads `billing_settings`, `society_live`, `payments` | pass the caller's society |
| `/api/flat-family`, `/api/flat-plan`, `/api/flat-remove` | read and write `flats`, `members`, `towers` with the server key | add `society_id` to every read and write; `flat_blockers` with a society |
| `/api/payment-proof` | reads a file (R2) and calls Workers AI; no table | check that the file's folder belongs to the caller's society (R2 keys carry no society yet) |
| `lib/mainAdmin.ts` (`mainAdminId`) | "oldest committee login of the WHOLE project" (or `MAIN_ADMIN_EMAIL`) | main admin of the caller's society (as `is_main_admin()` already is in the database) |
| `lib/memberships.ts` | `societyOfCaller` falls back to Aakar when a login has no membership | remove the fallback |

Also open (decisions, not code): where R2 files of different societies live (one prefix per society?), `help_guide` shared or per society, `flats.edit_code`, `maintenance` / `businesses` tables, platform-owner identity.

## 4. Proposed order for 4d (each: local proof, aanganone, staging, then live after a backup)
1. Group E + the matching routes (`/api/backup`, `/api/docs`): explicit society.
2. Group B (flat lookups) and the three views.
3. Group C (actions that take an id), in two or three batches by area (bookings, events, complaints / letters / meetings).
4. Group D (triggers) and the remaining routes (`committee`, `residents`, `flat-*`, `mainAdmin`).
5. Remove the temporary fallbacks, then step 4e (a second test society tries to cross every wall).
Number of scripts: expect roughly 5 to 7 (LIKELY, not confirmed until the live text is read).
