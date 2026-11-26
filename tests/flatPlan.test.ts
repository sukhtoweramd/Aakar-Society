// Flat generator (19 Nov 2026): numbering, rates, limits, server rules. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFlatPlan, flatNumberFor, parseNumbers, planClashes, planError, planSummary, planWarnings, type TowerPlan } from "../lib/flatPlan";
import { normaliseFlat } from "../lib/residents";
import { floorOf, flatNumber } from "../lib/society";

const t = (code: string, over: Partial<TowerPlan> = {}): TowerPlan => ({ code, floors: 3, perFloor: 4, terrace: false, maint: 2000, maintTerrace: 3000, ...over });

test("numbering: tower letter + floor + 2-digit position", () => {
  assert.equal(flatNumberFor("A", 1, 1), "A101");
  assert.equal(flatNumberFor("A", 10, 3), "A1003");
  const p = buildFlatPlan([t("A", { floors: 10, perFloor: 4 })]);
  assert.equal(p.length, 40);
  assert.deepEqual(p.slice(0, 4).map((f) => f.id), ["A101", "A102", "A103", "A104"]);
  assert.equal(p[39].id, "A1004");
  assert.ok(p.every((f) => f.flat_no === f.id && f.tower === "A"));
});

test("every generated flat is read back correctly by the app (floor, number, login lookup)", () => {
  for (const f of buildFlatPlan([t("A", { floors: 12, perFloor: 4 }), t("C", { floors: 5, perFloor: 3 })])) {
    assert.equal(floorOf(f as any), f.floor);
    assert.equal(flatNumber(f as any) % 100 >= 1, true);
    assert.equal(normaliseFlat(f.id), f.id);
  }
});

test("rates: terrace floor of a terrace tower gets the terrace rate; others the standard rate", () => {
  const p = buildFlatPlan([t("A", { terrace: true }), t("B")]);
  assert.deepEqual(Array.from(new Set(p.filter((f) => f.tower === "A" && f.floor < 3).map((f) => f.maintenance))), [2000]);
  assert.deepEqual(Array.from(new Set(p.filter((f) => f.tower === "A" && f.floor === 3).map((f) => f.maintenance))), [3000]);
  assert.deepEqual(Array.from(new Set(p.filter((f) => f.tower === "B").map((f) => f.maintenance))), [2000]);
});

test("order: tower, then floor, then position; no duplicate ids", () => {
  const p = buildFlatPlan([t("C"), t("A")]);
  assert.equal(p[0].id, "A101");
  assert.equal(new Set(p.map((f) => f.id)).size, p.length);
});

test("checks: code, duplicates, floors, per floor, money, total", () => {
  assert.match(planError([]), /at least one/);
  assert.match(planError([t("AB")]), /single capital letter/);
  assert.match(planError([t("a")]), /single capital letter/);
  assert.match(planError([t("A"), t("A")]), /twice/);
  assert.match(planError([t("A", { floors: 0 })]), /floors/);
  assert.match(planError([t("A", { floors: 61 })]), /floors/);
  assert.match(planError([t("A", { floors: 2.5 })]), /floors/);
  assert.match(planError([t("A", { perFloor: 41 })]), /per floor/);
  assert.match(planError([t("A", { perFloor: NaN })]), /per floor/);
  assert.match(planError([t("A", { maint: -1 })]), /maintenance/);
  assert.match(planError([t("A", { maint: 1_000_001 })]), /maintenance/);
  assert.match(planError([t("A", { terrace: true, maintTerrace: -5 })]), /terrace/);
  assert.match(planError([t("A", { floors: 60, perFloor: 20 })]), /most this screen creates/);
  assert.equal(planError([t("A"), t("B")]), "");
  assert.throws(() => buildFlatPlan([t("AB")]));
});

test("summary lines", () => {
  assert.deepEqual(planSummary([t("A", { terrace: true })]), [{ code: "A", flats: 12, first: "A101", last: "A304", terraceFlats: 4 }]);
});

test("a joined-home tower (this copy's FLAT_RULES) with 2+ flats per floor gets a warning; with the rule off there is none", () => {
  assert.equal(planWarnings([t("A")]).length, 0);
  assert.equal(planWarnings([t("B", { perFloor: 1 })]).length, 0);
  assert.equal(planWarnings([t("B")]).length, 1);
  const none = { joinedLetters: [], separate: [] };
  assert.equal(planWarnings([t("B")], none).length, 0);
  for (const f of buildFlatPlan([t("B", { floors: 12, perFloor: 4 })])) assert.equal(normaliseFlat(f.id, none), f.id);
});

test("server route: main admin only, refuses when flats exist, builds its own list, undoes a failed insert", () => {
  const r = readFileSync("app/api/flat-plan/route.ts", "utf8");
  assert.match(r, /isMainAdminUser/);
  assert.match(r, /planWarnings\(towers\)/);
  assert.match(r, /getAuthedClient/);
  assert.match(r, /buildFlatPlan\(towers\)/);
  assert.match(r, /already has/);
  assert.match(r, /\.delete\(\)\.eq\("society_id", society\)\.in\("id"/);   // the undo names the society too (step 4d-3)
  assert.doesNotMatch(r, /body\.flats|body\.plan/);
});

test("screen: shown only while there are no flats, 44 px buttons, no table, pure helper", () => {
  const panel = readFileSync("app/ledger/FlatSetupPanel.tsx", "utf8");
  assert.match(panel, /part === "FLOORS" && <FlatGenerator/);
  assert.match(panel, /part === "FLOORS" && locked && <FlatRemover/);
  assert.doesNotMatch(panel, /supabase|\.insert\(|\.update\(|\.delete\(|\.upsert\(|fetch\(|api\(/);
  const g = readFileSync("app/ledger/FlatGenerator.tsx", "utf8");
  assert.match(g, /min-h-\[44px\]/);
  assert.match(g, /min-w-0/);
  assert.doesNotMatch(g, /<table/);
  assert.doesNotMatch(readFileSync("lib/flatPlan.ts", "utf8"), /^import .*supabaseClient/m);
});

test("screen: the old floor list is hidden while there are no flats; the result message clears when a number changes", () => {
  assert.match(readFileSync("app/ledger/FlatSetupPanel.tsx", "utf8"), /part === "FLOORS" && locked && cur/);
  assert.match(readFileSync("app/ledger/FlatGenerator.tsx", "utf8"), /const set = \(code: string, patch: Partial<Row>\) => \{ setMsg\(null\)/);
});

const typed = (code: string, layout: { floor: number; numbers: string[] }[], over: Partial<TowerPlan> = {}): TowerPlan => ({ code, floors: 0, perFloor: 0, terrace: false, maint: 2000, maintTerrace: 3000, layout, ...over });

test("parseNumbers: commas, spaces, dashes, lower case", () => {
  assert.deepEqual(parseNumbers("D101, D102,D103"), ["D101", "D102", "D103"]);
  assert.deepEqual(parseNumbers("d-101 d-102  D 103"), ["D101", "D102", "D103"]);
  assert.deepEqual(parseNumbers("D101\nD102"), ["D101", "D102"]);
  assert.deepEqual(parseNumbers("  "), []);
});

test("typed floors: any numbering, floor from the row, terrace = the highest floor", () => {
  const p = buildFlatPlan([typed("D", [{ floor: 2, numbers: ["D201", "D203"] }, { floor: 1, numbers: ["D101", "D102", "D150"] }, { floor: 3, numbers: ["D301"] }], { terrace: true })]);
  assert.deepEqual(p.map((f) => f.id), ["D101", "D102", "D150", "D201", "D203", "D301"]);
  assert.deepEqual(p.map((f) => f.floor), [1, 1, 1, 2, 2, 3]);
  assert.deepEqual(p.map((f) => f.maintenance), [2000, 2000, 2000, 2000, 2000, 3000]);
  assert.deepEqual(planSummary([typed("D", [{ floor: 1, numbers: ["D101", "D102"] }, { floor: 2, numbers: ["D201"] }], { terrace: true })]), [{ code: "D", flats: 3, first: "D101", last: "D201", terraceFlats: 1 }]);
});

test("typed floors: checks", () => {
  assert.match(planError([typed("D", [])]), /at least one floor/);
  assert.match(planError([typed("D", [{ floor: 1, numbers: [] }])]), /type the flat numbers/);
  assert.match(planError([typed("D", [{ floor: 0, numbers: ["D001"] }])]), /floor/);
  assert.match(planError([typed("D", [{ floor: 1, numbers: ["D101"] }, { floor: 1, numbers: ["D102"] }])]), /twice/);
  assert.match(planError([typed("D", [{ floor: 1, numbers: ["101"] }])]), /not a flat number/);
  assert.match(planError([typed("D", [{ floor: 1, numbers: ["D101", "D101"] }])]), /typed twice/);
  assert.match(planError([typed("D", [{ floor: 1, numbers: ["D101"] }]), typed("E", [{ floor: 1, numbers: ["D101"] }])]), /typed twice/);
  assert.match(planError([typed("B", [{ floor: 1, numbers: ["B202"] }])]), /logs in as B201/);   // this copy's joined-home rule
  assert.equal(planError([typed("D", [{ floor: 1, numbers: ["D101", "D102"] }])]), "");
  assert.equal(planError([typed("B", [{ floor: 1, numbers: ["B101"] }])]), "");
});

test("clashes with flats that exist (any tower, any spelling)", () => {
  const p = buildFlatPlan([t("D", { floors: 1, perFloor: 3 })]);
  assert.deepEqual(planClashes(p, ["A101", "d102 "]), ["D102"]);
  assert.deepEqual(planClashes(p, []), []);
});

test("generator also works in a society that has flats (only towers with no flats), remover is main admin only", () => {
  const g = readFileSync("app/ledger/FlatGenerator.tsx", "utf8");
  assert.match(g, /!have\.has\(t\.code\)/);
  assert.match(g, /planClashes/);
  assert.match(g, /TYPE EACH FLOOR/);
  const r = readFileSync("app/api/flat-plan/route.ts", "utf8");
  assert.match(r, /already has flats/);
  assert.match(r, /planClashes\(plan/);
  assert.doesNotMatch(r, /count\(\) > 0|\(count \|\| 0\) > 0/);
});
