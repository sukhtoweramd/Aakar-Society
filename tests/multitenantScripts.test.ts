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

// Step 4c-3: flat ids, tower codes and nomination rows per society (MT_07).
const mt07 = readFileSync(join(root, "multitenant/MT_07_FLAT_KEYS.sql"), "utf8");
const mt07undo = readFileSync(join(root, "multitenant/MT_07_UNDO.sql"), "utf8");

test("MT_07 keys flats / towers / nomination_status by society, remakes the links and rewrites the two functions", () => {
  assert.match(mt07, /primary key \(society_id, id\)/);
  assert.match(mt07, /FOREIGN KEY \(society_id, \\1\)/);
  assert.match(mt07, /flats\(society_id, id\)/);
  assert.match(mt07, /'towers', 'code'/);
  assert.match(mt07, /'nomination_status', 'flat_id'/);
  assert.match(mt07, /on conflict \(society_id, flat_id\)/, "nominees_changed must conflict on the new key");
  assert.match(mt07, /f\.society_id = old\.society_id/, "towers_guard must count the society's own flats");
  assert.match(mt07, /drop constraint if exists flats_tower_check/);
  assert.match(mt07undo, /primary key \(id\)/);
  assert.match(mt07undo, /flats_tower_check/);
  readFileSync(join(root, "multitenant/MT_07_TEST.sql"), "utf8");
});

test("the nomination 'form received' button saves without an upsert (the key is (society_id, flat_id) after MT_07)", () => {
  const src = readFileSync(join(root, "app/ledger/NomineePanel.tsx"), "utf8");
  assert.doesNotMatch(src, /nomination_status"\)\s*\.upsert/);
});

// Step 4c-4: the society_id default is the login's society (MT_08).
const mt08 = readFileSync(join(root, "multitenant/MT_08_SOCIETY_DEFAULT.sql"), "utf8");
const mt08undo = readFileSync(join(root, "multitenant/MT_08_UNDO.sql"), "utf8");

test("MT_08 changes the society_id default on every MT_02 table, and the undo puts Aakar's id back", () => {
  const list = (s: string) => {
    const m = s.match(/tabs text\[\] := array\[([\s\S]*?)\];/);
    assert.ok(m, "table list not found");
    return Array.from(m![1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
  };
  assert.deepEqual(list(mt08), listedTables(), "MT_08 must cover exactly the tables of MT_02");
  assert.deepEqual(list(mt08undo), listedTables(), "MT_08_UNDO must cover exactly the tables of MT_02");
  assert.match(mt08, /set default public\.current_society_or_first\(\)/);
  assert.match(mt08, /Run MT_06/, "MT_08 needs the MT_06 helper and must say so");
  assert.doesNotMatch(mt08, /set default %L/, "the new default must not be a fixed id (the check query may still name Aakar to count leftovers)");
  assert.match(mt08undo, /a4a4a4a4-0000-4000-8000-000000000001/);
  assert.match(mt02, /current_society_or_first/, "the MT_02 check must accept the MT_08 default too");
  readFileSync(join(root, "multitenant/MT_08_TEST.sql"), "utf8");
});

// Step 4d-1: clearing test documents and restoring a backup act on one society (MT_09).
const mt09 = readFileSync(join(root, "multitenant/MT_09_BACKUP_CLEAR_SCOPE.sql"), "utf8");
const mt09undo = readFileSync(join(root, "multitenant/MT_09_UNDO.sql"), "utf8");

test("MT_09 scopes clear_test_documents and restore_society_backup to one society, keeps them closed to members, and can be undone", () => {
  for (const fn of ["clear_test_documents", "restore_society_backup"]) {
    assert.ok(mt09.includes(fn), `MT_09 does not cover ${fn}`);
    assert.ok(mt09undo.includes(fn), `MT_09_UNDO does not cover ${fn}`);
  }
  assert.match(mt09, /p_society uuid DEFAULT NULL::uuid/, "the society is an optional last argument (the 4-argument call keeps meaning Aakar)");
  assert.match(mt09, /where society_id = v_society/);
  assert.match(mt09, /select %L::uuid/, "restored rows are written with the society's id, never the file's");
  assert.match(mt09, /a\.attname <> ''society_id''/, "a society_id inside a backup file is ignored");
  assert.match(mt09, /revoke all on function public\.clear_test_documents\(integer, integer, integer, integer, uuid\) from public, anon, authenticated/);
  assert.match(mt09, /revoke all on function public\.restore_society_backup\(jsonb, uuid\) from public, anon, authenticated/);
  assert.match(mt09, /on conflict \(fn\) do update/, "the saved original must always be refreshed while the old form is present");
  assert.match(mt09, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.doesNotMatch(mt09, /chr\(10\)/, "the script must not depend on a fixed line break (a function pasted from Windows has CR + LF)");
  assert.match(mt09undo, /zz_mt09_function_backup/);
  readFileSync(join(root, "multitenant/MT_09_TEST.sql"), "utf8");
});
