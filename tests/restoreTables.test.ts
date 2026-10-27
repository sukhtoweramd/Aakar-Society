// Audit M3: every table that goes into a backup must also come back on restore.
// Reads BACKUP_TABLES (lib/backup.ts) and the restore list in the highest-numbered sql-security/*RESTORE*.sql
// (not an _UNDO), and fails if a table is backed up but not restored, or restored in the wrong order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function backupTables(): string[] {
  const src = readFileSync(join(root, "lib/backup.ts"), "utf8");
  const m = src.match(/export const BACKUP_TABLES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(m, "BACKUP_TABLES not found in lib/backup.ts");
  return Array.from(m![1].matchAll(/"([a-z_]+)"/g), (x) => x[1]);
}

function latestRestoreScript(): string {
  const dir = join(root, "sql-security");
  const files = readdirSync(dir).filter((f) => /RESTORE/i.test(f) && /\.sql$/i.test(f) && !/UNDO/i.test(f)).sort();
  assert.ok(files.length, "no sql-security/*RESTORE*.sql script");
  return join(dir, files[files.length - 1]);
}

function restoreTables(file: string): string[] {
  const sql = readFileSync(file, "utf8");
  const m = sql.match(/ins\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/);
  assert.ok(m, `restore list (ins text[] := array[...]) not found in ${file}`);
  return Array.from(m![1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
}

test("every backed-up table is restored", () => {
  const file = latestRestoreScript();
  const restored = new Set(restoreTables(file));
  const missing = backupTables().filter((t) => !restored.has(t));
  assert.deepEqual(missing, [], `backed up but not restored by ${file}: ${missing.join(", ")}`);
});

test("restore keeps parents before children", () => {
  const order = restoreTables(latestRestoreScript());
  const before = (a: string, b: string) => assert.ok(order.indexOf(a) < order.indexOf(b), `${a} must come before ${b}`);
  before("flats", "members");
  before("committee_areas", "complaints");
  before("nominees", "nomination_status");
  before("booking_areas", "bookings");
});
