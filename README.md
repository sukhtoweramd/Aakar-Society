# Aakar Sukh Tower – Society Management (Ahmedabad, 90 flats)

Next.js 14 (App Router) · Supabase (database + login) · Cloudflare R2 (files) · Cloudflare Workers AI · Vercel (hosting)
Installable on phones (PWA). Built for phones first: most members use it on mobile.

## Features
- **Flats** – grid of all flats by tower, MY FLAT page (family, vehicles, emergency contacts, directory consent),
  Excel import (adds/updates, never deletes), flat profile cards
- **Flat documents** – fixed list (Index, Dastavej, Torrent Power bill, Property tax bill, Rent agreement, Share certificate,
  Allotment letter, Prathmik karar, Other), per-flat checklist, compression in the browser before upload,
  REPORTS → FLAT DOCUMENTS
- **Nominee** – one or more nominees with share % (total 100%), guardian for minors, only the last 4 digits of Aadhaar,
  printable nomination form, committee ticks the signed form; REPORTS → NOMINATIONS
- **Billing** – half-yearly maintenance bills, receipts, ledger, letters, "I have paid" with AI reading of the screenshot
- **Notices** – text + attachment, login banners, printed notices on the letterhead
- **Complaints** – to the committee member responsible for the area, numbered CMP/yy-yy/nnnn, open → in progress → closed with a note
- **Common plot bookings** – TOWER-A, TOWER-B, COMMON; morning / evening; Chairman or Secretary approves;
  approval posts the "remove vehicles" notice and banner automatically
- **Committee** – areas of responsibility, AMC register, minutes with action points
- **Events** – photos, team, minutes, accounts, registration and passes
- **Admin** – logins, MEMBER SCREENS (which tabs members see), backup & restore, HELP GUIDE, storage used
- **HELP** – answers members' questions from `content/help-kb.md` (or the guide saved in ADMIN → HELP GUIDE)

## Login
- Committee logins (email) and flat logins (flat number). Roles are in `app_metadata` (see `CLAUDE.md`).
- Committee logins are added only from ADMIN → committee logins in the app (this sets role = committee), and only the
  main admin login can add them. Never create logins in the Supabase dashboard.
- Keep **Authentication → Sign In / Providers → "Allow new users to sign up" OFF** and anonymous sign-in OFF.

## Files
- Files are in a Cloudflare R2 bucket and are always opened through short-lived signed links after a login check
  (`/api/file/link`, `/api/payment-proof`); see `CLAUDE.md`.

## Setup
1. Run the SQL scripts in the Supabase SQL Editor, in the order they were added (each is safe to re-run and ends with a
   check). The old `SUPABASE_SETUP.sql` was removed (security audit, Oct 2026): it gave every login full access.
   Added 25 Oct 2026: `MEMBER_SCREENS.sql`, `COMPLAINTS.sql`, `NOMINEES.sql`, `BOOKINGS.sql`.
   Security scripts are in `sql-security/` (numbered, each with an `_UNDO`).
2. Vercel → Settings → Environment Variables: the list (names only) is in `CLAUDE.md` → Handover document.
3. Never commit real keys or residents' data to this repo – it is public.

## Checks
`npm run typecheck` · `npm test` · `npm run build`

## Excel import columns
`Tower, Floor, Flat No, Owner Name, BHK, Maintenance, Email, Committee, Status` (Status: `filled` or `pending`) (only Tower and Flat No are required).
Flat No can be written `1001`, `A1001` or `A-1001`; it is stored as `A1001` and matched to the existing flat; blank cells leave existing values unchanged.
