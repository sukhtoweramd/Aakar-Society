// Charges categories (30 Oct 2026): B101 and B102 are separate flats in Tower C and get their own category,
// so the rate of a joined 4 BHK home (B201/202 …) is never applied to them. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCategories } from "../lib/society";

const flat = (id: string, tower: string, floor: number, flat_no = id, maintenance: number | null = null): any =>
  ({ id, tower, floor, flat_no, maintenance, bhk: null, sqft: null });

test("Tower C: joined homes and the two separate flats are different categories", () => {
  const flats = [
    flat("B101", "C", 1, "B101"), flat("B102", "C", 1, "B102"),
    ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => flat(`B${n}01`, "C", n, `B${n}01/${n}02`, 5500)),
    flat("B1001", "C", 10, "B1001/1002", 5500),
  ];
  const cats = buildCategories(flats);
  const by = Object.fromEntries(cats.map((c) => [c.key, c]));
  assert.deepEqual(Object.keys(by).sort(), ["C_STD", "C_STD_SINGLE", "C_TERRACE"]);
  assert.deepEqual(by.C_STD_SINGLE.ids, ["B101", "B102"]);
  assert.equal(by.C_STD_SINGLE.label, "TOWER C FLOOR 1 • SEPARATE FLATS");
  assert.equal(by.C_STD.ids.length, 8);
  assert.equal(by.C_STD.label, "TOWER C FLOORS 2-9");
  assert.equal(by.C_STD.maint, 5500);
  assert.equal(by.C_STD_SINGLE.maint, null);   // not set yet: billing shows "no maintenance set"
  assert.equal(cats.reduce((n, c) => n + c.ids.length, 0), 11);
});

test("towers without joined homes keep two categories", () => {
  const flats = [flat("A101", "A", 1), flat("A201", "A", 2), flat("A1001", "A", 10)];
  assert.deepEqual(buildCategories(flats).map((c) => c.key), ["A_STD", "A_TERRACE"]);
  assert.equal(buildCategories(flats)[0].label, "TOWER A FLOORS 1-2");
});
