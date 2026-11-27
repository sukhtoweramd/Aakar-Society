// Terms and privacy text (27 Nov 2026): pure text, uses the society's name it is given, never Aakar's, and says data is shared with consent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { privacySections, termsSections, OWNER_DUTIES } from "../lib/legalText";
import { ADMIN_SECTIONS } from "../lib/adminSections";
import { cleanWord } from "../lib/societyWord";

const flat = (xs: { title: string; paras?: string[]; bullets?: string[] }[]) => xs.map((x) => [x.title, ...(x.paras || []), ...(x.bullets || [])].join(" ")).join(" ");

test("privacy notice names the Act, the society, consent and the rights; terms name the society", () => {
  const p = flat(privacySections("Green View Chs Ltd.")), t = flat(termsSections("Green View Chs Ltd."));
  assert.match(p, /Digital Personal Data Protection Act, 2023/); assert.match(p, /Green View Chs Ltd\./); assert.match(t, /Green View Chs Ltd\./);
  assert.match(p, /only with their consent/); assert.match(p, /Members' and tenants' details/);
  for (const w of ["corrected", "erased", "Data Protection Board", "Supabase", "Cloudflare", "Vercel", "under 18"]) assert.match(p, new RegExp(w), w);
  assert.match(flat(privacySections()), /your housing society/i);
});

test("no society's own name is typed into the text", () => {
  assert.doesNotMatch(flat(privacySections()) + flat(termsSections()), /aakar|sukh tower|ahmedabad/i);
  assert.doesNotMatch(readFileSync("app/legal/page.tsx", "utf8") + readFileSync("app/ledger/LegalView.tsx", "utf8"), /aakar/i);
});

test("owner duties label each point CONFIRMED / LIKELY / UNKNOWN", () => {
  assert.ok(OWNER_DUTIES.length >= 4); for (const d of OWNER_DUTIES) assert.ok(["CONFIRMED", "LIKELY", "UNKNOWN"].includes(d.label) && d.text);
});

test("ADMIN has the TERMS & PRIVACY tile and /legal, /terms, /privacy cannot be society words", () => {
  assert.ok(ADMIN_SECTIONS.some((s) => s.key === "LEGAL"));
  for (const w of ["legal", "terms", "privacy"]) assert.equal(cleanWord(w), null);
  assert.match(readFileSync("app/ledger/Login.tsx", "utf8"), /href="\/legal"/);
});
