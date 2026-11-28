-- LG_02_DOCS_SEED.sql - GENERATED from lib/legalDocs.ts by `npx tsx scripts/legalSeed.ts`. Do not edit by hand: change the text in lib/legalDocs.ts and generate again.
-- Run by hand in the Supabase SQL Editor AFTER LG_01_LEGAL_TABLES.sql. Safe to run again. Changes no society data: it only fills the registry of documents.
-- A PUBLISHED version is never changed: if its hash differs from what is stored, the script stops and tells you to add a new version instead.
-- Drafts can be updated. Documents that are not listed here are left alone.
do $$
declare
  r record; cur record;
begin
  if to_regclass('public.legal_documents') is null then
    raise exception 'Run LG_01_LEGAL_TABLES.sql first (public.legal_documents is missing).';
  end if;
  for r in
    select * from (values
  ('society-privacy-notice', 1, 'draft', 'Society Privacy Notice', array['society_admin', 'committee', 'flat', 'tenant']::text[], 'first_login', '0c94ae7dfbd79f3ab76128c772c90e8e7349fbbba8e99c01cba8eb586e87e2d4'),
  ('application-terms', 1, 'draft', 'Application Terms', array['society_admin', 'committee', 'flat', 'tenant']::text[], 'first_login', 'c41cbf5248f0538286a2eb6623d984bf8220d718ce21ea439e91c5f6ca0197db')
    ) as t(doc_key, version, status, title, audience, required_at, sha256)
  loop
    select * into cur from public.legal_documents d where d.doc_key = r.doc_key and d.version = r.version;
    if found and cur.status in ('published', 'retired') and cur.sha256 is distinct from r.sha256 then
      raise exception 'Document % version % is already % and its text changed. A published version is never edited: add version % instead.', r.doc_key, r.version, cur.status, r.version + 1;
    end if;
    insert into public.legal_documents (doc_key, version, status, title, audience, required_at, sha256)
    values (r.doc_key, r.version, r.status, r.title, r.audience, r.required_at, r.sha256)
    on conflict (doc_key, version) do update
      set status = excluded.status, title = excluded.title, audience = excluded.audience, required_at = excluded.required_at, sha256 = excluded.sha256;
  end loop;
end $$;

-- Check: the registry as it is now (compare with lib/legalDocs.ts: same keys, versions, statuses and hashes).
select doc_key, version, status, required_at, audience, left(sha256, 12) as hash_start from public.legal_documents order by doc_key, version;
