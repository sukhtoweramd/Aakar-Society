// Audit PR-5: downloading a backup is for the main admin login only (server decides; the screen only hides buttons).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const route = readFileSync(join(root, "app/api/backup/route.ts"), "utf8");
const panel = readFileSync(join(root, "app/ledger/BackupPanel.tsx"), "utf8");

test("server: downloading a stored backup checks the main admin BEFORE reading it", () => {
  const check = route.indexOf("if (!(await isMainAdminLogin(admin, me.userId))) return MAIN_ADMIN_ONLY();");
  const read = route.indexOf("readStoredBackup(key)");
  assert.ok(check > 0 && read > 0 && check < read);
  assert.ok(route.indexOf("if (id) {") < check, "check must be inside the ?id= branch");
});

test("server: making a backup that is sent to the browser checks the main admin BEFORE building it", () => {
  const start = route.indexOf('body.action === "backup"');
  const check = route.indexOf("isMainAdminLogin(admin, me.userId)", start);
  const build = route.indexOf("buildBackup(admin, me.email", start);
  assert.ok(start > 0 && check > start && check < build);
});

test("server: the 403 message names the main admin, and list/log stay committee-only (not main-admin-only)", () => {
  assert.match(route, /Only the main admin login can download a backup\./);
  assert.match(route, /if \(!me\.isCommittee\) return/);
  const listPart = route.slice(route.indexOf('searchParams.get("log")'), route.indexOf("export async function POST"));
  assert.ok(!listPart.includes("MAIN_ADMIN_ONLY()"), "list and log are not blocked");
});

test("screen: both download buttons are shown only to the main admin", () => {
  assert.match(panel, /info\?\.isMainAdmin \? \(\s*<button onClick=\{backupNow\}/);
  assert.match(panel, /\{info\.isMainAdmin && <button onClick=\{\(\) => download\(s\)\}/);
});
