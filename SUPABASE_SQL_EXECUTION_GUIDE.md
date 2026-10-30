# Supabase SQL execution guide (from 30 Oct 2026)

Scripts added by the 30 Oct 2026 work, in the order to run them. Run each by hand in Supabase → SQL Editor:
open the file on GitHub, copy everything, paste, **Run**, then compare the check result at the bottom with "Expected".
Take a backup first (ADMIN → BACKUP & RESTORE → DOWNLOAD FULL BACKUP). Every script is safe to run twice.

| # | Script | Needed by | Status |
|---|---|---|---|
| 1 | `SPLIT_B101_B102.sql` | Step 2: B101 and B102 as separate flats (PR "B101 / B102 split") | to run after the PR is merged and live |

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
a family member, an owner name or a login). **Not yet run on the live database.**
