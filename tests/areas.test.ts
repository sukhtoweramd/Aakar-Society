// Areas of responsibility: one responsible member + several backups (30 Oct 2026). Sample flats only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentError, backupsOf, isHandler } from "../lib/areaRules";

const committee = new Set(["A101", "A201", "A301", "A401", "A501", "B103"]);
const on = (id: string) => committee.has(id);

test("several backups are fine; same rules as the database", () => {
  assert.equal(assignmentError("A101", ["A201", "A301", "A401"], 4, on), "");
  assert.match(assignmentError("A101", ["A101"], 4, on), /cannot also be a backup/);
  assert.match(assignmentError("A101", ["A201", "A201"], 4, on), /twice/);
  assert.match(assignmentError("A101", ["A201", "A301", "A401", "A501", "B103"], 4, on), /At most 4/);
  assert.match(assignmentError("A909", [], 4, on), /Not on the committee: A909/);
});

test("someone who left the committee stays until replaced (only new choices are checked)", () => {
  assert.equal(assignmentError("A101", ["A909", "A201"], 4, on, ["A101", "A909"]), "");
});

test("backups list falls back to the older single backup", () => {
  assert.deepEqual(backupsOf({ backup_flat: "A201", backup_flats: null }), ["A201"]);
  assert.deepEqual(backupsOf({ backup_flat: "A201", backup_flats: ["A201", "A301"] }), ["A201", "A301"]);
  assert.deepEqual(backupsOf({ backup_flat: null }), []);
});

test("a complaint reaches the responsible member and every backup", () => {
  const c = { assigned_flat: "A101", backup_flat: "A201", backup_flats: ["A201", "A301"] };
  for (const f of ["A101", "A201", "A301"]) assert.ok(isHandler(c, f), f);
  assert.ok(!isHandler(c, "A401"));
  assert.ok(!isHandler(c, null));
});
