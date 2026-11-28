# Legal documents and acceptance records (28 Nov 2026) - how to run PR 1

Nothing here is run by the app or by Claude. You run each script by hand in the Supabase SQL Editor, **test project ("aanganone") first**, live after you are happy.
Nothing in PR 1 changes what members see or can do: it only adds two tables, three functions and a read-only preview in ADMIN -> LEGAL DOCUMENTS.

## Order
| # | Script | Where | What to expect |
|---|---|---|---|
| 1 | `LG_01_LEGAL_TABLES.sql` | test, then live | ends with a check table: tables exist = 2, RLS on both = 2, anon can read either = false, authenticated can write acceptances = false, society wall restrictive = true, functions exist = 3, anon can run accept = false |
| 2 | `LG_02_DOCS_SEED.sql` | test, then live | ends by listing the registry: `society-privacy-notice` v1 draft and `application-terms` v1 draft, with the first 12 characters of each hash |
| 3 | `LG_01_TEST.sql` | **test only** | ends with a red error by design. Read the lines after `RESULT:`: every line says "want ..." and line 18 must say `PASS`. Nothing is kept |
| - | `LG_01_UNDO.sql` | only if needed | removes both tables and the functions; stops if acceptance records exist |

Before running on live: take a full backup from ADMIN -> BACKUP & RESTORE (the scripts touch no existing table, but it is your rule).

## Validation queries (read only, run any time after step 2)
```sql
-- 1. the registry matches the code (compare hash_start with the seed script's check output)
select doc_key, version, status, required_at, audience, left(sha256, 12) as hash_start from public.legal_documents order by doc_key, version;

-- 2. nobody can write acceptances except through the function: expect 0 rows
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'legal_acceptances' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT';

-- 3. acceptances recorded so far, per society (empty until a later PR asks members to accept)
select society_id, doc_key, version, count(*) from public.legal_acceptances group by 1, 2, 3 order by 1, 2, 3;
```
Note: `GRANTS_ALL.sql` gives `authenticated` insert / update / delete on every table. Do not run it after this PR without re-running the revoke line of LG_01 (`revoke all on public.legal_acceptances from authenticated; grant select ... to authenticated;`). Row rules would still refuse a write (no insert / update / delete rule exists), but keep the grants tight.

## Changing a document later
1. Edit the text in `lib/legalDocs.ts`. **A published version is never edited**: copy it as `version + 1` and add it to `LEGAL_DOCS`.
2. `npx tsx scripts/legalSeed.ts` rewrites `LG_02_DOCS_SEED.sql`; `npm test` fails if you forget.
3. Run the new seed script (test, then live). It refuses to change a published version.

## Not in this PR (the series)
First-login acceptance screen, per-person family sharing, society onboarding agreement, platform agreements (Service Agreement and Data Processing Agreement), acceptance audit screen. See the PR sequence in the project document "Terms, privacy and consent: PR sequence".
