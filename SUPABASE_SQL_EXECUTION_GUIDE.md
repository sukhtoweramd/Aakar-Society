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
| 5 | `AREAS_BACKUPS.sql` | Step 5: several backups per area, who may change areas | to run after the areas PR is merged and live |

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
stays; a complaint goes to the holder and both backups and a backup's flat login can see it. **Not yet run on live.**
