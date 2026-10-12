# Aakar Sukh Tower – Society Management (Ahmedabad, 90 flats)

Next.js 14 (App Router) · Supabase (database + login) · Cloudflare R2 (files) · Vercel (hosting)

## Features
- **Flats** – grid of all flats, filter by tower/status, search, per-flat document upload (R2), Excel import (adds/updates, never deletes)
- **Notices** – title + text + optional attachment (PDF/JPG/PNG/DOCX, max 4 MB) stored in R2
- **Reports** – CSV download and printable PDF of the directory, with counts

## Login
Committee members log in with **email + password** using Supabase Auth.
There are no built-in or hardcoded passwords.

Add a committee member: Supabase → Authentication → Users → **Add user** → *Create new user* (tick *Auto Confirm User*).
Keep **Authentication → Sign In / Providers → "Allow new users to sign up" turned OFF**, otherwise anyone could create a login.

## Setup
1. Run `SUPABASE_SETUP.sql` once in Supabase → SQL Editor (safe to re-run; deletes nothing).
2. Vercel → Settings → Environment Variables (see `.env.example` for names):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `..._ANON_KEY`),
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
3. Never commit real keys to this repo – it is public.

## Excel import columns
`Tower, Floor, Flat No, Owner Name, BHK, Maintenance, Email, Committee, Status` (only Tower and Flat No are required).
Rows are matched to existing flats by ID (e.g. `A-101`); blank cells leave existing values unchanged.
