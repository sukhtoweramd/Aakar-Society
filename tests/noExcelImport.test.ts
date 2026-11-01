// Audit PR-9: the Excel import feature (and its vulnerable xlsx library) is gone. Excel files can still be stored as
// plain attachments (Vault, flat documents); that needs no library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("the Excel import route is gone and nothing imports xlsx", () => {
  assert.ok(!existsSync(join(root, "app/api/upload/route.ts")));
  for (const d of ["app", "lib", "tests"]) for (const f of files(join(root, d))) {
    if (f.endsWith("noExcelImport.test.ts")) continue;
    assert.ok(!/from\s+["']xlsx["']|require\(["']xlsx["']\)/.test(readFileSync(f, "utf8")), `${f} imports xlsx`);
  }
});

test("package.json no longer lists xlsx", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies?.xlsx, undefined);
  assert.equal(pkg.devDependencies?.xlsx, undefined);
});

test("the ADMIN screen has no Excel import button or call to /api/upload", () => {
  const admin = readFileSync(join(root, "app/ledger/AdminTab.tsx"), "utf8");
  assert.ok(!/api\/upload|IMPORT FROM EXCEL|handleExcel/.test(admin));
});

test("storing an .xlsx file as an attachment is still allowed", () => {
  assert.match(readFileSync(join(root, "lib/r2Client.ts"), "utf8"), /xlsx:\s*"application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
});
