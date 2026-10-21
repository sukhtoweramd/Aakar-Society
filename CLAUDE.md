# Notes for working on this repo

## SQL scripts (Supabase)
- From 30 Oct 2026 Supabase no longer gives new `public` tables automatic access for the website (Data API).
  Every script that creates a table must, in the same script: enable RLS, add its policies, `revoke all ... from anon`,
  and `grant select, insert, update, delete ... to authenticated, service_role` (views: `grant select`).
  New sequences: `grant usage, select ... to authenticated, service_role`.
- `GRANTS_ALL.sql` re-applies these grants to every table; safe to run again (e.g. after a restore).
- Scripts are run by hand in the Supabase SQL Editor: keep them safe to re-run, and end with a short check query.

## Never in this repo (it is public)
- Real keys, passwords or residents' data. Keys live only in Vercel environment variables.
- Screenshots and mock-ups use sample data only.

## Handover document (requested 21 Oct 2026 — prepare at project completion)
- One-page technical document for the committee: services used (Vercel, Supabase, Cloudflare R2 + Workers AI, GitHub),
  and every Vercel environment variable: its NAME, what it is for, and where to get it (site + screen). Never the values.
- Current variables read by the code: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID / CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME, R2_PUBLIC_URL / CLOUDFLARE_R2_PUBLIC_URL, MAIN_ADMIN_EMAIL; planned: CLOUDFLARE_AI_TOKEN (screenshot reading).
- Keep this list updated whenever a new variable is added.
