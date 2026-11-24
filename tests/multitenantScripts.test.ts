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
