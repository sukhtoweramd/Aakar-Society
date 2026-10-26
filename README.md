# Aakar Sukh Tower – Society Management (Ahmedabad, 90 flats)

Next.js 14 (App Router) · Supabase (database + login) · Cloudflare R2 (files) · Vercel (hosting)

## Features
- **Flats** – grid of all flats, filter by tower/status, search, per-flat document upload (R2), Excel import (adds/updates, never deletes)
- **Notices** – title + text + optional attachment (PDF/JPG/PNG/DOCX, max 4 MB) stored in R2
- **Reports** – CSV download and printable PDF of the directory, with counts

## Login
Committee members log in with **email + password** using Supabase Auth.
There are no built-in or hardcoded passwords.

Committee logins are added only from ADMIN → committee logins in the app (this sets role = committee). Never create logins in the Supabase dashboard.
Keep **Authentication → Sign In / Providers → "Allow new users to sign up" turned OFF**, otherwise anyone could create a login.

## Setup
1. SQL scripts are run in the order they were added; security scripts are in `sql-security/`.
2. Vercel → Settings → Environment Variables (see `.env.example` for names):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `..._ANON_KEY`),
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
3. Never commit real keys to this repo – it is public.

## Excel import columns
`Tower, Floor, Flat No, Owner Name, BHK, Maintenance, Email, Committee, Status` (Status: `filled` or `pending`) (only Tower and Flat No are required).
Flat No can be written `1001`, `A1001` or `A-1001`; it is stored as `A1001` and matched to the existing flat; blank cells leave existing values unchanged.
