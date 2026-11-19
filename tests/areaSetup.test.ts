// Common areas screen (19 Nov 2026): name checks, ordering, delete rule. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areaDescError, areaNameError, canDeleteArea, moveArea, nextAreaSort } from "../lib/areaSetup";

const areas = [
  { id: "1", name: "Plot A", sort: 10 },
  { id: "2", name: "Plot B", sort: 20 },
  { id: "3", name: "Terrace", sort: 30 },
];

test("name: needed, trimmed, limited, no duplicate (any letter case)", () => {
  assert.match(areaNameError("  ", areas), /needs a name/);
  assert.match(areaNameError("x".repeat(61), areas), /60/);
  assert.match(areaNameError("a\u0007b", areas), /cannot be printed/);
  assert.match(areaNameError(" plot a ", areas), /already an area/);
  assert.equal(areaNameError("Club house", areas), "");
  assert.equal(areaNameError("PLOT A", areas, "1"), "");          // own name when renaming
  assert.match(areaNameError("Plot B", areas, "1"), /already/);
});

test("description: optional, limited", () => {
  assert.equal(areaDescError(""), "");
  assert.match(areaDescError("x".repeat(201)), /200/);
});

test("new area goes to the end", () => {
  assert.equal(nextAreaSort(areas), 40);
  assert.equal(nextAreaSort([]), 10);
});

test("move: swaps neighbours, renumbers 10, 20, 30, returns only changed rows", () => {
  assert.deepEqual(moveArea(areas, "2", -1), [{ id: "2", sort: 10 }, { id: "1", sort: 20 }]);
  assert.deepEqual(moveArea(areas, "2", 1), [{ id: "3", sort: 20 }, { id: "2", sort: 30 }]);
  assert.deepEqual(moveArea(areas, "1", -1), []);
  assert.deepEqual(moveArea(areas, "3", 1), []);
  assert.deepEqual(moveArea(areas, "nope", 1), []);
});

test("move: untidy sort values are renumbered", () => {
  const r = moveArea([{ id: "a", name: "A", sort: 0 }, { id: "b", name: "B", sort: 0 }], "b", -1);
  assert.deepEqual(r.map((x) => x.id).sort(), ["a", "b"]);
});

test("delete only when there are no bookings", () => {
  assert.equal(canDeleteArea(0), true);
  assert.equal(canDeleteArea(1), false);
});

test("panel: in ADMIN, edit controls need can_set_booking_charge, phone first, pure helper", () => {
  const p = readFileSync("app/ledger/BookingAreasPanel.tsx", "utf8");
  assert.match(p, /can_set_booking_charge/);
  assert.match(p, /min-h-\[44px\]/);
  assert.match(p, /min-w-0/);
  assert.doesNotMatch(p, /<table/);
  assert.match(readFileSync("app/ledger/AdminTab.tsx", "utf8"), /<BookingAreasPanel \/>/);
  assert.doesNotMatch(readFileSync("lib/areaSetup.ts", "utf8"), /^import .*supabaseClient/m);
});
