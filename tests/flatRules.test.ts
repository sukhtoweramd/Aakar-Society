// The flat-number rule (joined homes, B202 -> B201) belongs to ONE society (26-27 Nov 2026): Aakar keeps its rule, every other
// society has none. Sample data only. Imports only pure files (no supabaseClient), as CI needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AAKAR_RULES, NO_JOINED_RULES, normaliseFlat, parseLogin, rulesFor } from "../lib/residents";
import { buildFlatPlan, planError, planWarnings, type TowerPlan } from "../lib/flatPlan";

const t = (code: string, over: Partial<TowerPlan> = {}): TowerPlan => ({ code, floors: 3, perFloor: 4, terrace: false, maint: 2000, maintTerrace: 3000, ...over });

test("rulesFor: the first society (no word, or aakar) keeps Aakar's rule; any other word has no joined homes", () => {
  assert.equal(rulesFor(null), AAKAR_RULES);
  assert.equal(rulesFor(undefined), AAKAR_RULES);
  assert.equal(rulesFor(""), AAKAR_RULES);
  assert.equal(rulesFor("aakar"), AAKAR_RULES);
  assert.equal(rulesFor("sample-gardens"), NO_JOINED_RULES);
  assert.equal(rulesFor("test-park"), NO_JOINED_RULES);
  assert.deepEqual(NO_JOINED_RULES, { joinedLetters: [], separate: [] });
});

test("the same typed number gives different flats in two societies (B202: joined in Aakar, its own flat elsewhere)", () => {
  assert.equal(normaliseFlat("B-202", rulesFor("aakar")), "B201");
  assert.equal(normaliseFlat("B-202", rulesFor("sample-gardens")), "B202");
  assert.equal(normaliseFlat("B-102", rulesFor("aakar")), "B102");           // Aakar's separate flats unchanged
  assert.equal(normaliseFlat("A-102", rulesFor("aakar")), "A102");
  assert.equal(normaliseFlat("A-1", rulesFor("sample-gardens")), null);
});

test("login names: parseLogin follows the society's rule, tenant form too", () => {
  assert.deepEqual(parseLogin("B-202", rulesFor("aakar")), { flat: "B201", tenant: false });
  assert.deepEqual(parseLogin("B-202", rulesFor("sample-gardens")), { flat: "B202", tenant: false });
  assert.deepEqual(parseLogin("B-202-T", rulesFor("aakar")), { flat: "B201", tenant: true });
  assert.deepEqual(parseLogin("B-202-T", rulesFor("sample-gardens")), { flat: "B202", tenant: true });
  assert.equal(parseLogin("T", rulesFor("sample-gardens")), null);
});

test("flat generator: a tower B with several flats per floor is refused for Aakar and fine for another society", () => {
  const b = [t("B", { floors: 12, perFloor: 4 })];
  assert.equal(planWarnings(b, rulesFor("aakar")).length, 1);
  assert.equal(planWarnings(b, rulesFor("sample-gardens")).length, 0);
  assert.equal(planError([{ ...t("B"), layout: [{ floor: 1, numbers: ["B101", "B102"] }, { floor: 2, numbers: ["B202"] }], floors: 0, perFloor: 0 }], rulesFor("aakar")).match(/logs in as B201/) !== null, true);
  assert.equal(planError([{ ...t("B"), layout: [{ floor: 2, numbers: ["B201", "B202"] }], floors: 0, perFloor: 0 }], rulesFor("sample-gardens")), "");
  const ids = buildFlatPlan(b, rulesFor("sample-gardens")).map((f) => f.id);
  for (const id of ids) assert.equal(normaliseFlat(id, rulesFor("sample-gardens")), id, "every created flat can log in as itself");
  assert.ok(ids.includes("B102") && ids.includes("B202"));
});

// Source check: nobody falls back to Aakar's rule by forgetting to pass one. `rules` is a required argument, and a server route / screen
// must take it from the society (rulesFor), never from a constant.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (["node_modules", ".next", "tests", ".git"].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
test("no screen or route uses Aakar's rule directly: only rulesFor(word) (lib/residents.ts defines AAKAR_RULES)", () => {
  const root = join(__dirname, "..");
  for (const f of [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib"))]) {
    if (f.endsWith(join("lib", "residents.ts"))) continue;
    const src = readFileSync(f, "utf8");
    assert.ok(!/AAKAR_RULES|FLAT_RULES/.test(src), `${f} names Aakar's rule directly; use rulesFor(society word)`);
  }
});

test("the routes take the rule from the caller's society word", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
  for (const f of ["app/api/residents/route.ts", "app/api/committee/route.ts", "app/api/flat-family/route.ts", "app/api/flat-plan/route.ts"]) {
    const s = read(f);
    assert.match(s, /rulesFor\(/, f);
    assert.match(s, /societyWordOf\(admin, society\)/, f);
    for (const l of s.split("\n").filter((x) => /normaliseFlat\(/.test(x) && !/^\s*(\/\/|import)/.test(x))) assert.ok(/rules/.test(l), `${f}: normaliseFlat called without a rule: ${l.trim().slice(0, 80)}`);
  }
  assert.match(read("app/ledger/Login.tsx"), /parseLogin\(email, rulesFor\(word\)\)/);
  assert.match(read("app/ledger/FlatGenerator.tsx"), /rulesFor\(/);
});
