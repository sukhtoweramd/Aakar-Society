// Flat generator (19 Nov 2026): numbering, rates, limits, server rules. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFlatPlan, flatNumberFor, planError, planSummary, planWarnings, type TowerPlan } from "../lib/flatPlan";
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

test("tower B with a position 02 gets a warning (login lookup of Aakar's joined homes)", () => {
  assert.equal(planWarnings([t("A")]).length, 0);
  assert.equal(planWarnings([t("B", { perFloor: 1 })]).length, 0);
  assert.equal(planWarnings([t("B")]).length, 1);
});

test("server route: main admin only, refuses when flats exist, builds its own list, undoes a failed insert", () => {
  const r = readFileSync("app/api/flat-plan/route.ts", "utf8");
  assert.match(r, /isMainAdminUser/);
  assert.match(r, /getAuthedClient/);
  assert.match(r, /buildFlatPlan\(towers\)/);
  assert.match(r, /already has/);
  assert.match(r, /\.delete\(\)\.in\("id"/);
  assert.doesNotMatch(r, /body\.flats|body\.plan/);
});

test("screen: shown only while there are no flats, 44 px buttons, no table, pure helper", () => {
  const panel = readFileSync("app/ledger/FlatSetupPanel.tsx", "utf8");
  assert.match(panel, /part === "FLOORS" && !locked && <FlatGenerator/);
  assert.doesNotMatch(panel, /supabase|\.insert\(|\.update\(|\.delete\(|\.upsert\(|fetch\(|api\(/);
  const g = readFileSync("app/ledger/FlatGenerator.tsx", "utf8");
  assert.match(g, /min-h-\[44px\]/);
  assert.match(g, /min-w-0/);
  assert.doesNotMatch(g, /<table/);
  assert.doesNotMatch(readFileSync("lib/flatPlan.ts", "utf8"), /^import .*supabaseClient/m);
});
