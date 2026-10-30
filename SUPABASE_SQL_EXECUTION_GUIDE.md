# Supabase SQL execution guide (from 30 Oct 2026)

Scripts added by the 30 Oct 2026 work, in the order to run them. Run each by hand in Supabase → SQL Editor:
open the file on GitHub, copy everything, paste, **Run**, then compare the check result at the bottom with "Expected".
Take a backup first (ADMIN → BACKUP & RESTORE → DOWNLOAD FULL BACKUP). Every script is safe to run twice.

| # | Script | Needed by | Status |
|---|---|---|---|
| 1 | `SPLIT_B101_B102.sql` | Step 2: B101 and B102 as separate flats (PR #24) | **run 30 Oct 2026, check OK** |
| 2 | `BILLING_ANNUAL.sql` | Step 3: annual rates, half-yearly bills, rented 1.5× (PR #25) | **run 30 Oct 2026, check OK** |
| 3 | `CONTACTS.sql` | Step 4: CONTACTS tab | to run after the contacts PR is merged and live |
| 4 | `sql-security/08_RESTORE_contacts.sql` | Step 4: restores bring contacts back | right after 3 |

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
active contacts and cannot add; a committee login sees all and can change. **Not yet run on the live database.**
