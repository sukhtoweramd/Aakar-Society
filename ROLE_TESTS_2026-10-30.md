# Role tests after the 30 Oct 2026 changes

Run on the live site with **test flats / test data only**. Tick each line. ✗ = must be refused (an error, nothing shown,
or the button absent). After a refused write, reload and check that nothing changed.

Logins needed: main admin (society account) • Chairman's committee login (linked to the Chairman flat) • Secretary's
committee login • a plain committee login (e.g. Treasurer) • a flat login of an **owner-occupied** test flat (call it
FLAT-O) • a flat login of a **rented** test flat with a tenant login (FLAT-R) • that flat's **tenant login** (FLAT-R-T) •
not logged in.

## 1. Not logged in
- [ ] The site shows only the login page.
- [ ] `https://aakarsociety.vercel.app/api/residents`, `/api/committee`, `/api/backup`, `/api/docs` in a private window → "Please log in again" (401).

## 2. Main admin
- [ ] COMMITTEE → RESPONSIBILITIES: can rename an area, add one, hide one, change "backups per area (max)"; can assign people.
- [ ] CONTACTS: + ADD CONTACT, edit, switch off / on.
- [ ] BILLING → LETTERS: approve a test request; LETTER FORMATS edit / switch off.
- [ ] Rented test flat page: TENANT LOGIN card → create / reset / revoke.

## 3. Chairman (own committee login) — same for Secretary
- [ ] RESPONSIBILITIES: can choose responsible member and backups (✗ cannot rename or hide an area — error shown).
- [ ] ✗ choose the same member as responsible and backup; ✗ a non-committee flat; ✗ more than 4 backups.
- [ ] LETTERS: APPROVE and NOT ISSUE are shown and work.
- [ ] Common plot booking approval works (as before).

## 4. Plain committee login (e.g. Treasurer)
- [ ] RESPONSIBILITIES is view only (text says so); ✗ any change is refused if tried.
- [ ] LETTERS: a waiting request shows "Waiting for the Chairman / Secretary to approve"; after approval, ISSUE LETTER works.
- [ ] Bills, receipts, AMC, minutes work as before.

## 5. Owner of an owner-occupied flat (FLAT-O)
- [ ] MY FLAT: bills, ledger, letters, nominee, documents, family / vehicles editable (head of family fill-once).
- [ ] REQUEST A LETTER lists the society's formats; a bank letter later shows READY TO COLLECT, then collected.
- [ ] ✗ INDEX → another flat does not open; ✗ BILLING / COMMITTEE / ADMIN tabs absent.
- [ ] CONTACTS visible (no edit buttons). Cover committee order: Chairman, Secretary, Treasurer, members, co-opted.

## 6. Owner of a rented flat (FLAT-R, tenant login exists)
- [ ] Sees the tenant family, vehicles, emergency contacts, with the note "The tenant keeps … up to date"; ✗ no add / edit / ✕ buttons.
- [ ] Bills (with the extra 0.5× line on a new half-year bill), ledger, letters, nominee, documents as an owner.

## 7. Tenant (FLAT-R-T, logs in as e.g. A-103-T)
- [ ] Forced to set own password at first login.
- [ ] Tabs: MY FLAT, NOTICES, CONTACTS, EVENTS (+ COVER if shown). ✗ INDEX, DIRECTORY, BUSINESS, VAULT, FLOOR.
- [ ] MY FLAT: add / edit family (✗ change the head's name once filled), vehicles, emergency contacts.
- [ ] Raise a complaint with a photo; the photo opens. Book the common plot; cancel own booking.
- [ ] ✗ No bills, ledger, "I have paid", nominee, letters, documents anywhere.
- [ ] EVENTS: if added as Assisting, sees the team, minutes, REGISTRATION / gate scan; ✗ ACCOUNTS money book.
- [ ] Committee marks TENANT MOVED OUT → reload: "This tenant login is switched off".

## 8. Billing (committee)
- [ ] NEW BILLS for a test half-year: owner-occupied = annual ÷ 2; rented = annual ÷ 2 × 1.5 (two lines); B101 / B102 billed separately once their rate is set.
- [ ] ADMIN → charges shows MAINT ₹ / YEAR; Tower B one row of 40; Tower C rows: floors 2-9, floor 1 separate flats, floor 10 terrace.

## 9. Database check
- [ ] Run `sql-security/00c_LIVE_CHECK_oct30_read_only.sql` (read only): every row `ok = true`. Send the result.

Write the date, the login used and anything that failed next to each line.
