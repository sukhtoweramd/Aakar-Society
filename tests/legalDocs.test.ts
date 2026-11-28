// Legal documents and acceptance records (28 Nov 2026, PR 1): one registry in lib/legalDocs.ts, a generated seed, and SQL that keeps evidence safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGAL_DOCS, canonicalText, latestPublished, renderDoc, renderText, ALL_LOGINS } from "../lib/legalDocs";
import { docHash } from "../lib/legalHash";
import { legalSeedSql } from "../lib/legalSeed";

const read = (f: string) => readFileSync(f, "utf8");
const all = (d: (typeof LEGAL_DOCS)[number]) => canonicalText(d);

test("every document has a unique (key, version), valid audience, sections and no empty text", () => {
  const ids = LEGAL_DOCS.map((d) => `${d.key}@${d.version}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of LEGAL_DOCS) {
    assert.match(d.key, /^[a-z][a-z0-9-]*$/); assert.ok(d.version >= 1 && Number.isInteger(d.version));
    assert.ok(d.audience.length > 0 && d.audience.every((a) => ALL_LOGINS.includes(a)));
    assert.ok(d.sections.length >= 5, d.key);
    for (const s of d.sections) assert.ok(s.title && ((s.paras?.length || 0) + (s.bullets?.length || 0)) > 0, `${d.key}: ${s.title}`);
  }
});

test("versions of a key run 1, 2, 3 without gaps", () => {
  for (const k of Array.from(new Set(LEGAL_DOCS.map((d) => d.key)))) {
    const v = LEGAL_DOCS.filter((d) => d.key === k).map((d) => d.version).sort((a, b) => a - b);
    assert.deepEqual(v, v.map((_, i) => i + 1), k);
  }
});

test("no society's own name or place is typed into a document (they use {{society}})", () => {
  for (const d of LEGAL_DOCS) { assert.doesNotMatch(all(d), /aakar|sukh tower|ahmedabad/i, d.key); assert.match(all(d), /\{\{society\}\}/, d.key); }
});

test("placeholders fill in; without a society the text says 'your housing society'", () => {
  assert.equal(renderText("{{society}} on {{platform}}", "Green View Chs"), "Green View Chs on GrihSahara");
  assert.match(renderText("{{society}}"), /your housing society/);
  const r = renderDoc(LEGAL_DOCS[0], "Green View Chs");
  assert.doesNotMatch(canonicalText(r), /\{\{/);
});

test("the privacy notice says what the owner asked for: purposes, visibility, family private by default, no consent for another adult, rights, no guarantee", () => {
  const p = all(LEGAL_DOCS.find((d) => d.key === "society-privacy-notice")!);
  for (const re of [/Data Fiduciary/, /DPDP Rules, 2025/, /does not promise/, /private by default/, /One family member cannot agree for another adult/, /parent or legal guardian/,
    /withdraw a sharing choice at any time/, /corrected or updated/, /erased/, /Data Protection Board/, /does not routinely open or browse/, /Supabase/, /Cloudflare/, /Vercel/, /not sold/i])
    assert.match(p, re, String(re));
  assert.doesNotMatch(p, /fully compliant|guarantee[sd]? compliance|100%/i);
});

test("only published documents can be the latest; drafts are never offered", () => {
  assert.equal(latestPublished("society-privacy-notice"), undefined);   // PR 1 publishes nothing
  assert.equal(latestPublished("x", [{ ...LEGAL_DOCS[0], key: "x", version: 1, status: "published" }, { ...LEGAL_DOCS[0], key: "x", version: 2, status: "published" }, { ...LEGAL_DOCS[0], key: "x", version: 3, status: "draft" }])?.version, 2);
});

test("the hash is a 64-character SHA-256 and changes when one word changes", () => {
  const d = LEGAL_DOCS[0];
  assert.match(docHash(d), /^[0-9a-f]{64}$/);
  const edited = { ...d, sections: d.sections.map((s, i) => (i === 0 ? { ...s, paras: [...(s.paras || []).slice(0, -1), (s.paras || ["x"])[(s.paras || ["x"]).length - 1] + "!"] } : s)) };
  assert.notEqual(docHash(edited), docHash(d));
});

test("legal/LG_02_DOCS_SEED.sql is exactly what lib/legalDocs.ts generates (run: npx tsx scripts/legalSeed.ts)", () => {
  assert.equal(read("legal/LG_02_DOCS_SEED.sql"), legalSeedSql());
});

const lg01 = read("legal/LG_01_LEGAL_TABLES.sql"), undo = read("legal/LG_01_UNDO.sql"), test01 = read("legal/LG_01_TEST.sql");

test("LG_01 follows the repo rules: RLS, society wall, revoke from anon, no write grants for logins, an undo and a rolled-back test", () => {
  assert.match(lg01, /alter table public\.legal_documents enable row level security/);
  assert.match(lg01, /alter table public\.legal_acceptances enable row level security/);
  assert.match(lg01, /create policy society_wall on public\.legal_acceptances as restrictive/);
  assert.match(lg01, /revoke all on public\.legal_documents from anon/); assert.match(lg01, /revoke all on public\.legal_acceptances from anon/);
  assert.match(lg01, /grant select on public\.legal_acceptances to authenticated;/);
  assert.doesNotMatch(lg01, /grant (select, )?insert[^;]*on public\.legal_acceptances to authenticated/);
  assert.match(lg01, /society_id\s+uuid\s+not null default public\.active_society\(\) references public\.societies\(id\)/);
  assert.match(lg01, /unique \(society_id, user_id, doc_key, version\)/);
  assert.match(lg01, /An acceptance record is never changed/);
  assert.match(lg01, /security definer set search_path = public/);
  assert.match(lg01, /revoke all on function public\.accept_legal_document\(text, integer\) from public, anon/);
  assert.match(undo, /drop table if exists public\.legal_acceptances/); assert.match(undo, /force boolean := false/);
  assert.match(test01, /raise exception E'RESULT \(this error is expected/);
  for (const f of [lg01, undo, test01]) assert.doesNotMatch(f, /service_role_key|eyJ[A-Za-z0-9_-]{20,}/);
});

test("acceptance records are NOT in the society backup on purpose (a restore must never wipe evidence)", () => {
  const b = read("lib/backup.ts");
  assert.doesNotMatch(b.match(/export const BACKUP_TABLES\s*=\s*\[([\s\S]*?)\]/)![1], /legal_/);
});
