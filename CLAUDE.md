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
