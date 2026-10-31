# Supabase SQL execution guide (from 30 Oct 2026)

Scripts added by the 30 Oct 2026 work, in the order to run them. Run each by hand in Supabase → SQL Editor:
open the file on GitHub, copy everything, paste, **Run**, then compare the check result at the bottom with "Expected".
Take a backup first (ADMIN → BACKUP & RESTORE → DOWNLOAD FULL BACKUP). Every script is safe to run twice.

| # | Script | Needed by | Status |
|---|---|---|---|
| 1 | `SPLIT_B101_B102.sql` | Step 2: B101 and B102 as separate flats (PR #24) | **run 30 Oct 2026, check OK** |
| 2 | `BILLING_ANNUAL.sql` | Step 3: annual rates, half-yearly bills, rented 1.5× (PR #25) | **run 30 Oct 2026, check OK** |
| 3 | `CONTACTS.sql` | Step 4: CONTACTS tab (PR #27) | **run 30 Oct 2026, check OK** |
| 4 | `sql-security/08_RESTORE_contacts.sql` | Step 4: restores bring contacts back | **run 30 Oct 2026, check OK** |
| 5 | `AREAS_BACKUPS.sql` | Step 5: several backups per area, who may change areas (PR #28) | **run 30 Oct 2026, check OK** |
| 6 | `TENANT_LOGINS.sql` | Step 6: separate tenant login (PR #29) | **run 30 Oct 2026, tested live** |
| 7 | `sql-security/09_RESTORE_tenant_logins.sql` | Step 6: restores bring tenant logins back | run 30 Oct 2026 (result not kept; script 10's check confirms it) |
| 8 | `EVENT_ASSISTING.sql` | Step 7: event role Assisting (also for tenants) (PR #31) | **run 30 Oct 2026, check OK** |
| 9 | `LETTER_TEMPLATES.sql` | Step 8: letter formats, approval, unsigned bank letters (PR #32) | **run 30 Oct 2026, letters tested live** |
| 10 | `sql-security/10_RESTORE_letter_templates.sql` | Step 8: restores bring formats back | run? (confirm with 00c check) |
| 11 | `sql-security/12_CLEAR_TEST_ALL.sql` | CLEAR TEST DOCUMENTS clears all test data (PR #40) | run before GO LIVE |
| 15 | `RESOLUTION_REQUESTS.sql` | Members ask for "Request for transfer of flat" and give the new member's name (31 Oct 2026) | **not run yet** |
| 14 | `RESOLUTION_FORMAT.sql` | Committee resolution as a letter format: transfer of flat (31 Oct 2026) | **not run yet** |
| 13 | `DOB.sql` | Date of birth instead of age (31 Oct 2026) | **not run yet** |
| 12 | `BOOKING_CHARGES.sql` | Booking charges: four areas, full day, invoice on approval (31 Oct 2026) | **not run yet** |
| — | `sql-security/00c_LIVE_CHECK_oct30_read_only.sql` | Step 9: read-only check of everything above | run any time; every row ok = true |

---

## 1. `SPLIT_B101_B102.sql` — B101 and B102 become two flats

**What it changes:** the joined home B101 ("B-101/102", Tower C) becomes flat **B101**, and a new empty flat **B102** is added
(Tower C, floor 1). Maintenance, BHK and area of both are left empty so the joined home's rate is not charged twice.
Nothing else changes; every other joined home (B-201/202 … B-1001/1002) stays as it is.

**Prerequisites:** `RENUMBER_B_C.sql` run (28 Oct 2026). The PR for step 2 merged and the site redeployed (the new
charges category and B102 login need the new code).

**Safety checks (stops and changes nothing):** B101 has any member data (owner/tenant name, email, mobile, share
certificate, committee, documents link), any row in another table (family, vehicles, bills, receipts, letters,
bookings, complaints, nominees, events …), or a linked login; or B101 is not "B101/102".
If it stops, the message lists what was found — send it to Claude.

**Expected check result:**

| item | value |
|---|---|
| B101 | B101 • tower C • floor 1 • maint empty |
| B102 | B102 • tower C • floor 1 • maint empty |
| Tower C flats | 11 |
| joined homes (x01/x02) | 9 |
| all flats | 91 |
| flat rules on | true |

A second run only says "already separate flats. Nothing changed."

**After running:**
1. ADMIN → charges: a new row **TOWER C FLOOR 1 • SEPARATE FLATS (2 flats, B101-B102)** appears; the 4 BHK row becomes
   **TOWER C FLOORS 2-9 (8 flats)**. Enter MAINT ₹, SQFT and BHK for B101/B102 → **APPLY TO FLATS**.
2. Until then BILLING shows "no maintenance set" for B101 and B102 and does not bill them.
3. Flat logins for B101 and B102: create them from ADMIN → flat logins when the owners are known.
4. Take a new backup.

**If something goes wrong:** run `SPLIT_B101_B102_UNDO.sql` (only while B102 has no data; it joins the two back into
"B101/102" and copies the rate from B201), or restore the backup taken before.

**Tested:** on a local PostgreSQL 16 copy with sample tables (split, second run, undo, and refusal when B101 has a bill,
a family member, an owner name or a login). **Run on the live database 30 Oct 2026: check result as expected.**

---

## 2. `BILLING_ANNUAL.sql` — rented-flat multiplier setting

**What it changes:** adds one setting, `billing_settings.rent_multiplier` (default **1.5**, allowed 1–5), shown in
BILLING → SETTINGS → RENTED FLAT MULTIPLIER. Nothing else: no flat rate and no bill is changed.

**Why:** from this PR, `flats.maintenance` is the **annual** rate. A half-yearly bill = annual ÷ 2; a rented flat gets an
extra line of (multiplier − 1) × that amount. Without the script the app still uses 1.5; the script only lets the
committee change it.

**Prerequisites:** the PR for step 3 merged and live.

**Expected check result:** `rent multiplier 1.50`; `rates stored` lists the amounts now in the flats (e.g. `5500 → 9`);
`active maintenance bills` lists maintenance bills made under the old rule (rate × 6 months).

**After running:**
1. ADMIN → charges: enter every category's rate **per year** → APPLY TO FLATS (the old numbers were used as monthly).
2. The test maintenance bill listed in the check was calculated the old way: cancel or delete it (main admin → delete
   test bills) and make it again from BILLING → NEW BILLS.

**Undo:** `BILLING_ANNUAL_UNDO.sql` (removes the setting; the app then uses 1.5).

**Tested:** local PostgreSQL 16 with sample tables: run, second run, undo. **Run on the live database 30 Oct 2026: multiplier 1.50; annual rates entered for all 91 flats.**

---

## 3. `CONTACTS.sql` — important contacts

**What it changes:** new table `society_contacts` (category, service/name, contact person, phone, alternate phone, notes,
order, on/off, optional link to an AMC contract). Rules: every logged-in member reads **active** contacts; committee
logins read all, add and change; **nobody can delete** (no delete rule — switch off instead); anon has no access.
Also adds **CONTACTS** to the member screens (ADMIN → MEMBER SCREENS can hide it again).

**Prerequisites:** COMMITTEE_AMC.sql and MEMBER_SCREENS.sql (both run earlier). The contacts PR merged and live.

**Expected check result:** `table 1` • `rules 4` • `rls on true` • `anon can read false` • `CONTACTS in member tabs true`.

**Undo:** not needed while empty; to remove: `drop table public.society_contacts;` and untick CONTACTS in MEMBER SCREENS.

## 4. `sql-security/08_RESTORE_contacts.sql` — restore includes contacts

**What it changes:** adds `society_contacts` to the end of the restore list (backups already include it). No data change.

**Expected check result:** every row `true` (help_guide … event_checkins, society_contacts, only the server can run it).

**Undo:** `sql-security/08_UNDO.sql` (function as after script 07).

**Tested (3 and 4):** local PostgreSQL 16 with sample tables: run, second run, restore script + undo; a member login sees only
active contacts and cannot add; a committee login sees all and can change. **Run on the live database 30 Oct 2026: both checks as expected.**

---

## 5. `AREAS_BACKUPS.sql` — one responsible member + several backups

**What it changes:**
- `committee_areas.backup_flats` (list); the existing single backup is copied in; `backup_flat` stays = first backup.
- `app_settings.area_backup_limit` (default 4, 1–10; set in COMMITTEE → RESPONSIBILITIES by the main admin).
- A guard on every change of an area: areas themselves (add, rename, covers, phone, order, show) = **main admin login only**
  (the oldest committee login, as in `lib/backup.ts`); responsible member + backups = a committee login linked to the flat
  marked exactly **Chairman** or **Secretary**, or the main admin. Holder ≠ backup, no repeats, at most the limit, newly chosen
  flats must be on the committee; someone who leaves the committee stays until replaced. **Areas cannot be deleted.**
- Complaints: `complaints.backup_flats`; a new or moved complaint goes to the responsible member and **all** backups, who
  can see and update it.
- Functions `is_main_admin()`, `can_assign_areas()`, `area_rights()` (the screen asks what this login may do).

**Prerequisites:** COMMITTEE_AMC.sql, COMPLAINTS.sql, MEMBER_SCREENS.sql. The areas PR merged and live.

**Expected check result:** `backup lists column true` • `backup limit 4` • `guard on true` • `area rules 4` •
`can delete areas false` • `complaints backup list true` • `areas with backups N of 10` (N = areas that had a backup).

**Note:** after this, a committee login that is not the main admin and not linked to the Chairman / Secretary flat can only
**view** RESPONSIBILITIES. The Chairman and Secretary need their own committee logins linked to their flats
(ADMIN → committee logins → link flat).

**Undo:** `AREAS_BACKUPS_UNDO.sql` (back to one backup and any committee login; extra backups are removed).

**Tested:** local PostgreSQL 16 with sample tables and simulated logins: run, second run, undo; a plain committee login is
refused for both assigning and renaming; the Chairman can assign 3 backups but not rename; refused: holder as backup, a
non-committee flat, 5 backups; main admin can rename and add; nothing can be deleted; a member who left the committee
stays; a complaint goes to the holder and both backups and a backup's flat login can see it. **Run on live 30 Oct 2026: check as expected (0 of 10 areas had a backup).**

---

## 6. `TENANT_LOGINS.sql` — separate login for the tenant

**What it changes:**
- Table `flat_tenant_logins` (one row per tenant login; written only by the server and the move-out trigger; committee can read).
- `my_tenant_flat()` / `my_home_flat()` / `flat_has_tenant_login()`. A tenant login works only while its row is active and
  the flat is marked rented. Tenant logins carry `tenant_flat`, never `flat_id`, so **no existing owner rule applies to them**.
- Trigger: TENANT MOVED OUT (occupancy back to owner) switches the tenant login off at once.
- Family / vehicles / emergency contacts: owner reads; owner changes only while the flat has **no** active tenant login;
  tenant manages its own flat's rows. Head of family stays fill-once for tenants too.
- Complaints: tenant raises and sees its flat's complaints. Bookings: tenant books for its flat and cancels its own
  (`request_booking` / `cancel_booking` now use `my_home_flat()`; otherwise unchanged).
- Nothing opens bills, receipts, payments, nominees, letters, letter requests, flat documents or the flat row to a tenant.

**Prerequisites:** the tenant PR merged and live (the app must know the tenant role first). BOOKINGS.sql, COMPLAINTS.sql,
sql-security/05 and 06 run earlier.

**Expected check result:** `table 1` • `rules on table 1` • `moved-out trigger on true` • `members rules 6` • `vehicles rules 6` •
`emergency rules 6` • `complaints tenant rules 2` • `booking tenant rule 1` • `head guard uses my_home_flat true` • `tenant logins active 0`.
(If members / vehicles / emergency show another number, send the result: it means the live table had extra rules.)

**Undo:** `TENANT_LOGINS_UNDO.sql` (back to one login per flat; data kept).

## 7. `sql-security/09_RESTORE_tenant_logins.sql` — restore includes tenant logins

Adds `flat_tenant_logins` to the end of the restore list (backups already include it). **Expected:** every row `true`.
**Undo:** `sql-security/09_UNDO.sql`.

**Tested (6, 7):** local PostgreSQL 16 with simulated owner, tenant and committee logins: run, second run, undo, re-run; the
tenant sees only its flat's family, cannot change the head's name, cannot add for another flat, can raise a complaint and
book for its own flat but not another; the owner of the rented flat sees the family but cannot add or change; after
"moved out" the tenant login is off, the tenant sees nothing and the owner can edit again. **Run on live 30 Oct 2026; a tenant login was created and used on a flat without an owner login.**

---

## 8. `EVENT_ASSISTING.sql` — event role Assisting, also for tenants

**What it changes:** `event_team.role` may be **Assisting**; `event_team.member_kind` = `flat` (owner's household, as before) or
`tenant` (the tenant login of that flat). A tenant can only be Assisting, and only while the flat has an active tenant login
(trigger). The owner's household and the tenant of the same flat may both be on a team (unique per flat **and** kind).
`my_event_role()` also answers for a tenant login (its own tenant row only). The event money book is no longer visible
to Assisting (Convenor / Treasurer / Member, own payments, or public accounts as before).

**Prerequisites:** EVENT_COMMITTEES.sql, EVENT_REGISTRATION.sql, EVENT_CHECKINS.sql, TENANT_LOGINS.sql. The event PR merged and live.

**Expected check result:** `kind column true` • `Assisting allowed true` • `tenant only Assisting true` • `one-per-kind index 1` •
`guard on true` • `role function knows tenants true` • `money hidden from Assisting true`.

**Undo:** `EVENT_ASSISTING_UNDO.sql` (removes tenant and Assisting rows from teams; everything else as before).

**Tested:** local PostgreSQL 16 with simulated logins: run, second run, undo; the convenor adds a tenant as Assisting and the
same flat's household as Member; the tenant's role is Assisting and it sees no money rows; the household sees them;
adding a tenant without an active tenant login is refused. **Run on live 30 Oct 2026: check as expected.**

---

## 9. `LETTER_TEMPLATES.sql` — letter formats, approval, unsigned bank letters

**What it changes:**
- Table `letter_templates` (the society's standard formats: name, kind general / bank, subject, usual addressee, text with
  fields like `{{owner_name}}`). Every login reads the **active** formats (members choose one); committee reads all, adds,
  edits, switches off; **no delete**. Six starter formats are added only if there are none — check their wording against the
  society's own formats (BILLING → LETTERS → LETTER FORMATS).
- `letter_requests`: + `template_id`, status **approved**, `approved_by/at`, `history`. A guard: only a committee login linked
  to the **Chairman / Secretary** flat (or the main admin) approves or declines; a request is issued only after approval;
  every status change is written to the history.
- `letters`: + `request_id`, `unsigned`, `handed_over_at/by`. Bank-kind letters print with no signature and no stamp and a
  red "UNSIGNED COPY" line; the committee ticks SIGNED COPY HANDED OVER; the member sees READY TO COLLECT, then collected.

**Prerequisites:** LETTERS.sql, LETTER_REQUESTS.sql, AREAS_BACKUPS.sql (for `is_main_admin()`). The letters PR merged and live.

**Expected check result:** `formats table true` • `format rules 4` • `starter formats 6` • `bank formats 1` •
`request status has approved true` • `request guard on true` • `letters unsigned column true`.

**Undo:** `LETTER_TEMPLATES_UNDO.sql` (approved requests go back to waiting; formats removed; letters keep their text).

## 10. `sql-security/10_RESTORE_letter_templates.sql` — restore includes formats (and confirms 09)

Adds `letter_templates` to the restore list just before `letter_requests`. **Expected:** every row `true` — including
`flat_tenant_logins` (from 09) and `letter_templates`. **Undo:** `sql-security/10_UNDO.sql`.

**Tested (9, 10):** local PostgreSQL 16 with simulated logins: run, second run, undo, re-run; a member sees the 6 formats and
asks; a plain committee login cannot approve and cannot issue before approval; the Chairman approves, then issuing works;
history has 3 lines; a tenant login cannot ask. **Not yet run on live.**

## 11. `sql-security/12_CLEAR_TEST_ALL.sql` — CLEAR TEST DOCUMENTS clears all test data (31 Oct 2026)

Replaces `clear_test_documents()` (same name and inputs). Running the script changes **no data**; it only changes what
ADMIN → TEST DOCUMENTS → CLEAR removes later: bills, receipts, letters, "I have paid" reports, letter requests, events
(team, accounts, registrations, gate check-ins), meetings / minutes / action points, complaints, bookings, notices,
AMC contracts and visits, nominees and nomination status. Kept: flats, owners, family, vehicles, emergency contacts,
flat documents, businesses, committee, areas, contacts, booking areas, letter templates, signatories, settings, logins.
After the database step the app deletes the test files in R2 folders `notices/ events/ eventdocs/ minutes/
complaints/ amc/ payproofs/` (never `flats/ vault/ floor-plans/ backups/`). Still refused after GO LIVE; server only.
**Expected:** one row: `clears_all = true`, `members_can_run = false`, `society_live = 0`. **Undo:** `sql-security/12_UNDO.sql`
(back to bills / receipts / letters only). Run this script **before** pressing CLEAR; with the old function the app
clears only bills / receipts / letters and deletes no files.

**Tested:** local PostgreSQL 16 with sample tables: run, second run, clear (every listed table emptied, flats / members /
contacts kept, numbers reset), undo, and refused after a `society_live` row. **Not yet run on live.**

---

## 12. `BOOKING_CHARGES.sql` — common plot booking charges (31 Oct 2026)

**What it changes:**
- Areas become **Tower A area, Center area (new), Tower B area, Main common area**; a **charge per day** on each area. Bookings are **full day** (old morning / evening bookings stay as history).
- Charges are set only by the Chairman, the Secretary or the main admin (`set_booking_charge`, also a guard on direct edits); every change goes to the access log.
- On approval (`decide_booking`) one invoice is raised in the OTHER BILL series for whoever booked (owner, or tenant with `bills.tenant_bill`); ₹0 and society events make none; approving twice makes one. Cancelling cancels the invoice.
- Tenant invoices: the tenant login reads its flat's booking invoices, payments and reports "I have paid" for them only; the owner login does not see them.
- No new table (so no change to `BACKUP_TABLES`); new columns come back with a restore.

**Prerequisites:** BOOKINGS.sql, BILLING.sql, LETTERS.sql, TENANT_LOGINS.sql, AREAS_BACKUPS.sql, sql-security/05 run earlier, and the booking-charges app update live.

**Expected check result:** `areas` lists the four names with ₹0 • `new columns 6` • `bill rules (owner + tenant) 2` • `payment rules (owner + tenant) 2` • `charge guards (expect 2) 2` • `functions 5` • `request_booking versions (expect 1) 1`.
Then set the charges in COMMITTEE → BOOKINGS → BOOKING CHARGES.

**Undo:** `BOOKING_CHARGES_UNDO.sql` (morning / evening again, no charge; data kept).

---

## 13. `DOB.sql` — date of birth instead of age (31 Oct 2026)

**What it changes:** `members.dob` (optional date). The member directory view gets `birth_day` and `birth_month` for flats that share their family details (never the year). The full date is read only through the members table rules (that flat and the committee). No new table; backups carry the column.
**Meaning for families:** entering a date of birth = agreeing to share the birthday (day and month) with all members; empty = not shared. The old typed age stays until a date of birth is entered.
**Prerequisites:** COMMITTEE_ROLES.sql (the directory view) and the DOB app update live.
**Expected check result:** `dob column 1` • `directory birthday columns (expect 2) 2` • `directory has no full date (expect 0) 0` • `dates of birth entered 0` (more after families fill it in).
**Undo:** `DOB_UNDO.sql` (directory back to before; entered dates are kept in the column).

---

## 14. `RESOLUTION_FORMAT.sql` — resolution for transfer of flat (31 Oct 2026)

**What it changes:** letter formats get a third kind, **resolution**. `letters.layout` (letter / resolution) makes a resolution print with the committee's signature table. A database rule lets only the **Chairman or the Secretary** (committee login linked to their flat, or the main admin) issue a resolution. The society's "Resolution for transfer of flat" format is added if it is not there yet (wording as in the society's Word template). No new table; backups carry the new column.
**Prerequisites:** LETTERS.sql, LETTER_TEMPLATES.sql and the resolution app update live.
**Expected check result:** `resolution kind allowed true` • `letters.layout column 1` • `issue guard on true` • `transfer-of-flat format 1` • `letters issued as resolution 0`.
**Undo:** `RESOLUTION_FORMAT_UNDO.sql` (resolution formats switched off; issued resolutions stay on record).

---

## 15. `RESOLUTION_REQUESTS.sql` — a member asks for the resolution (31 Oct 2026)

**What it changes:** `letter_templates.request_name` (what members pick: "Request for transfer of flat") and `member_fields` (which fill-in fields the member gives: the new member's name); `letter_requests.details` (what the member typed). The database keeps only the fields the format asks for (each at most 200 characters) and refuses a request with one empty. The Chairman or Secretary approves the request after the committee meeting and issues the resolution (the existing member from the records, the new member from the request; the committee fills in the rest). No new table.
**Prerequisites:** RESOLUTION_FORMAT.sql (the format must exist) and the resolution-request app update live.
**Expected check result:** `new columns (expect 3) 3` • `request insert check on true` • `members ask for Request for transfer of flat` • `and are asked transferee_name`.
**Undo:** `RESOLUTION_REQUESTS_UNDO.sql` (members are no longer asked; sent requests keep their details).
