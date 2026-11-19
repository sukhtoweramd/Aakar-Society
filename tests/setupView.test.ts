// FLAT SETUP view (19 Nov 2026): structure only, never owner data; Aakar's quirks are shown as exceptions. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { followsPattern, numberingExceptions, towerViews } from "../lib/setupView";
import { towersFromRows } from "../lib/societySetup";

const flat = (id: string, tower: string, floor: number, flat_no = id, extra: any = {}): any => ({ id, tower, floor, flat_no, ...extra });
const sample = [
  flat("A101", "A", 1, "A101", { owner_name: "SECRET OWNER", owner_mobile: "9000000001", email: "secret@example.com" }),
  flat("A102", "A", 1), flat("A103", "A", 1), flat("A104", "A", 1),
  flat("A201", "A", 2), flat("A202", "A", 2), flat("A203", "A", 2), flat("A204", "A", 2),
  flat("A1001", "A", 10), flat("A1002", "A", 10),
  flat("B101", "B", 1), flat("B102", "B", 1),
  flat("B201", "C", 2, "B201/202"), flat("B301", "C", 3, "B301/302"),
  flat("B1101", "C", 11),
];
const towers = towersFromRows(null, sample);

test("towers: counts, floors, first and last flat, flats per floor", () => {
  const v = towerViews(sample, towers);
  const a = v.find((x) => x.code === "A")!;
  assert.equal(a.flats, 10);
  assert.equal(a.firstFloor, 1);
  assert.equal(a.lastFloor, 10);
  assert.equal(a.first, "A-101");
  assert.equal(a.last, "A-1002");
  assert.equal(a.perFloor, "2 to 4");
  assert.deepEqual(a.floors.map((r) => r.floor), [1, 2, 10]);
  assert.deepEqual(a.floors[0].flats, ["A-101", "A-102", "A-103", "A-104"]);
  assert.equal(a.inUse, true);
  assert.equal(v.find((x) => x.code === "B")!.perFloor, "2");
});

test("a tower with no flats is not locked and has empty fields", () => {
  const v = towerViews(sample, [{ code: "Z", name: "Tower Z", terrace: false }])[0];
  assert.equal(v.flats, 0);
  assert.equal(v.inUse, false);
  assert.equal(v.firstFloor, null);
  assert.equal(v.first, "");
  assert.equal(v.perFloor, "");
});

test("the view never contains owner data", () => {
  const out = JSON.stringify([towerViews(sample, towers), numberingExceptions(sample)]);
  for (const s of ["SECRET OWNER", "9000000001", "secret@example.com", "owner", "mobile", "email"]) assert.ok(!out.includes(s), s);
});

test("exceptions: joined homes and flats numbered with another letter than their tower", () => {
  const ex = numberingExceptions(sample);
  assert.deepEqual(ex.joined, [{ tower: "C", flats: ["B-201/202", "B-301/302"] }]);
  assert.deepEqual(ex.otherLetter, [{ tower: "C", flats: ["B-201/202", "B-301/302", "B-1101"] }]);
});

test("a plain society has no exceptions and every flat follows the pattern", () => {
  const plain = [flat("A101", "A", 1), flat("A102", "A", 1), flat("A201", "A", 2)];
  assert.deepEqual(numberingExceptions(plain), { joined: [], otherLetter: [] });
  assert.ok(plain.every(followsPattern));
});

test("followsPattern: tower letter + floor + unit", () => {
  assert.equal(followsPattern(flat("A1003", "A", 10)), true);
  assert.equal(followsPattern(flat("A204", "A", 2)), true);
  assert.equal(followsPattern(flat("B201", "C", 2)), false);      // other letter
  assert.equal(followsPattern(flat("A305", "A", 2)), false);      // floor does not match the number
  assert.equal(followsPattern(flat("SHOP1", "A", 0)), false);
});

test("the panel itself never writes; only the editors do, and the panel is shown in ADMIN", () => {
  const panel = readFileSync("app/ledger/FlatSetupPanel.tsx", "utf8");
  assert.doesNotMatch(panel, /supabase|\.insert\(|\.update\(|\.delete\(|\.upsert\(|fetch\(|api\(/);
  assert.doesNotMatch(panel, /owner_name|owner_mobile|\.email|tenant_name/);
  assert.match(readFileSync("app/ledger/AdminTab.tsx", "utf8"), /<FlatSetupPanel ctx=\{ctx\} \/>/);
});

test("phone first: 44 px buttons and nothing that scrolls sideways", () => {
  for (const f of ["app/ledger/FlatSetupPanel.tsx", "app/ledger/SetupEditors.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /min-h-\[44px\]/, f);
    assert.match(src, /min-w-0/, f);
    assert.doesNotMatch(src, /<table/, f);
  }
});

test("setupView.ts is a pure file (no supabaseClient), so npm test on Node 20 can import it", () => {
  assert.doesNotMatch(readFileSync("lib/setupView.ts", "utf8"), /^import .*supabaseClient/m);
});
