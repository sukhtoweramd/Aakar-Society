// Editing the society profile and towers (19 Nov 2026): checks before saving, and who may save. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FALLBACK_PROFILE } from "../lib/societySetup";
import { TOWER_CODE, newTowerError, nextTowerSort, profileToForm, towerNameError, validateProfile } from "../lib/setupEdit";

const good = () => ({ ...profileToForm(FALLBACK_PROFILE) });

test("the form of today's profile is valid and gives the row the database expects", () => {
  const r = validateProfile(good());
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.row.name, "AAKAR CO-OP");
    assert.equal(r.row.full_name, "AAKAR CO-OP HOUSING SOCIETY LTD.");
    assert.deepEqual(r.row.address_lines, ["Mirambica Road, Naranpura", "Ahmedabad - 380013"]);
    assert.deepEqual(Object.keys(r.row).sort(), ["address", "address_lines", "building", "city", "full_name", "name", "reg_date", "reg_no"]);
  }
});

test("the two names are needed; the rest may stay empty", () => {
  const r = validateProfile({ ...good(), name: " ", full: "", reg: "", regDate: "", building: "", address: "", lines: "", city: "" });
  assert.ok(!r.ok);
  if (!r.ok) assert.deepEqual(r.errors, ["Society name is needed.", "Full name is needed."]);
  const ok = validateProfile({ ...good(), reg: "", regDate: "", building: "", address: "", lines: "", city: "" });
  assert.ok(ok.ok);
});

test("length limits and unprintable characters are refused", () => {
  assert.ok(!validateProfile({ ...good(), name: "x".repeat(81) }).ok);
  assert.ok(!validateProfile({ ...good(), city: "Surat\u0000" }).ok);
  assert.ok(!validateProfile({ ...good(), lines: "a\nb\nc\nd\ne" }).ok);
  assert.ok(!validateProfile({ ...good(), lines: "x".repeat(81) }).ok);
  assert.ok(validateProfile({ ...good(), lines: "a\r\n\r\nb" }).ok);       // blank lines are dropped
});

test("address lines are trimmed and blank lines dropped", () => {
  const r = validateProfile({ ...good(), lines: "  one \n\n two  \n" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.row.address_lines, ["one", "two"]);
});

test("tower code: the same rule as the database", () => {
  for (const c of ["A", "WING-1", "b_2", "1"]) assert.match(c, TOWER_CODE);
  for (const c of ["", " ", "A B", "TOWER-LONG-1", "A/B", "ટ"]) assert.doesNotMatch(c, TOWER_CODE);
  const db = readFileSync("FLAT_SETUP_TABLES.sql", "utf8");
  assert.ok(db.includes("check (code ~ '^[A-Za-z0-9_-]{1,10}$')"));
});

test("a new tower: code, duplicate (any case) and name checks", () => {
  const ex = [{ code: "A", sort: 10 }, { code: "B", sort: 20 }];
  assert.equal(newTowerError("C", "Tower C", ex), "");
  assert.match(newTowerError("a", "Tower A", ex), /already exists/);
  assert.match(newTowerError("A B", "x", ex), /Tower code/);
  assert.match(newTowerError("C", " ", ex), /display name/i);
  assert.match(newTowerError("C", "x".repeat(61), ex), /at most 60/);
  assert.equal(towerNameError("Tower C"), "");
  assert.notEqual(towerNameError(""), "");
});

test("a new tower goes at the end", () => {
  assert.equal(nextTowerSort([]), 10);
  assert.equal(nextTowerSort([{ code: "A", sort: 10 }, { code: "B", sort: 40 }]), 50);
});

test("who may save is the database's rule, and the editors never touch the flats", () => {
  const ed = readFileSync("app/ledger/SetupEditors.tsx", "utf8");
  assert.match(ed, /rpc\("is_main_admin"\)/);
  assert.match(ed, /from\("society_profile"\)/);
  assert.match(ed, /from\("towers"\)/);
  assert.doesNotMatch(ed, /from\("flats"\)/);
  assert.match(ed, /only the main admin login can change this/);          // a refused save (no row changed) is reported, not hidden
  const db = readFileSync("FLAT_SETUP_TABLES.sql", "utf8");
  assert.match(db, /on public\.towers for update to authenticated using \(public\.is_main_admin\(\)\)/);
  assert.match(db, /on public\.society_profile for insert to authenticated with check \(public\.is_main_admin\(\)\)/);
});

test("a tower that flats use keeps its terrace setting and stays on in the screen, and the database stops its code change and deletion", () => {
  const ed = readFileSync("app/ledger/SetupEditors.tsx", "utf8");
  assert.match(ed, /checked=\{d\.terrace\} disabled=\{used\}/);
  assert.match(ed, /checked=\{d\.active\} disabled=\{used\}/);
  assert.match(ed, /\{!used && <button onClick=\{\(\) => removeRow/);
  assert.match(readFileSync("FLAT_SETUP_TABLES.sql", "utf8"), /cannot be deleted/);
});
