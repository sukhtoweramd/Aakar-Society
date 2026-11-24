// Multi-tenant step 2-3 (Nov 2026): MT_02 must give society_id to every backed-up table, and both scripts must use the same Aakar id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const mt02 = readFileSync(join(root, "multitenant/MT_02_SOCIETY_ID.sql"), "utf8");
const mt01 = readFileSync(join(root, "multitenant/MT_01_SOCIETIES.sql"), "utf8");

function listedTables(): string[] {
  const m = mt02.match(/tabs text\[\] := array\[([\s\S]*?)\];/);
  assert.ok(m, "table list not found in MT_02");
  return Array.from(m![1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
}

test("MT_02 covers every backed-up table, once", () => {
  const src = readFileSync(join(root, "lib/backup.ts"), "utf8");
  const b = src.match(/export const BACKUP_TABLES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(b);
  const backed = Array.from(b![1].matchAll(/"([a-z_]+)"/g), (x) => x[1]);
  const listed = listedTables();
  assert.deepEqual(backed.filter((t) => !listed.includes(t)), [], "backed-up table without society_id in MT_02");
  assert.equal(new Set(listed).size, listed.length, "duplicate table in MT_02");
  assert.ok(!listed.includes("zz_security_app_meta_backup"));
});

test("MT_01 and MT_02 use the same Aakar id", () => {
  const id = /a4a4a4a4-0000-4000-8000-000000000001/;
  assert.match(mt01, id);
  assert.match(mt02, id);
});

// Step 4c-1: numbers and names unique per society (MT_05).
const mt05 = readFileSync(join(root, "multitenant/MT_05_PER_SOCIETY_UNIQUE.sql"), "utf8");
const mt05undo = readFileSync(join(root, "multitenant/MT_05_UNDO.sql"), "utf8");

test("MT_05 makes every number per society, and has an undo and a test", () => {
  for (const pair of ["'bills','bill_no'", "'payments','receipt_no'", "'letters','ref_no'", "'complaints','complaint_no'",
    "'booking_areas','name'", "'letter_templates','name'", "'flats','flat_no'", "'flats','edit_code'"]) {
    assert.ok(mt05.includes(pair), `MT_05 does not cover ${pair}`);
    assert.ok(mt05undo.includes(pair), `MT_05_UNDO does not cover ${pair}`);
  }
  assert.match(mt05, /unique \(society_id, %I\)/);
  assert.match(mt05, /on public\.bills \(society_id, flat_id, period_from\)/);
  assert.match(mt05, /on public\.flat_tenant_logins \(society_id, flat_id\) where active/);
  assert.match(mt05, /c\.society_id = new\.society_id/, "complaint numbers must be counted inside the society");
  assert.doesNotMatch(mt05undo, /society_id = new\.society_id/, "the undo restores the old complaint trigger");
  readFileSync(join(root, "multitenant/MT_05_TEST.sql"), "utf8");
});

// Step 4c-2: the one-row settings tables per society (MT_06).
const mt06 = readFileSync(join(root, "multitenant/MT_06_SETTINGS_PER_SOCIETY.sql"), "utf8");
const mt06undo = readFileSync(join(root, "multitenant/MT_06_UNDO.sql"), "utf8");

test("MT_06 keys the five settings tables by society and rewrites the 'where id = 1' functions", () => {
  for (const t of ["billing_settings", "app_settings", "society_profile", "help_guide", "society_live"]) {
    assert.ok(mt06.includes(`'${t}'`), `MT_06 does not cover ${t}`);
    assert.ok(mt06undo.includes(`'${t}'`), `MT_06_UNDO does not cover ${t}`);
  }
  assert.match(mt06, /primary key \(society_id, id\)/);
  assert.match(mt06, /where society_id = public\.current_society_or_first\(\) and id = 1/);
  assert.match(mt06undo, /primary key \(id\)/);
  readFileSync(join(root, "multitenant/MT_06_TEST.sql"), "utf8");
});

test("the society profile is saved without an upsert on id (the key is (society_id, id) after MT_06)", () => {
  const src = readFileSync(join(root, "app/ledger/SetupEditors.tsx"), "utf8");
  assert.doesNotMatch(src, /onConflict:\s*"id"/);
});
