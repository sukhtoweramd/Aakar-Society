// Multi-tenant step 4d-1 (Nov 2026): backup, restore, GO LIVE and clear-test act on the CALLER's society only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { backupFolderOf, backupSocietyError, isBackupKey, keyBelongsTo, loginsOfSociety, societyOfBackupKey } from "../lib/backupScope";
import { FIRST_SOCIETY_ID } from "../lib/memberships";

const OTHER = "b4b4b4b4-0000-4000-8000-000000000002";
const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

test("R2 folders: the first society keeps backups/, others get their own folder", () => {
  assert.equal(backupFolderOf(FIRST_SOCIETY_ID), "backups");
  assert.equal(backupFolderOf(OTHER), `backups/${OTHER}`);
});

test("a society can read only its own backup keys", () => {
  const aakar = "backups/backup-2026-11-01-abc.json", other = `backups/${OTHER}/backup-2026-11-02-def.json`;
  assert.equal(societyOfBackupKey(aakar), FIRST_SOCIETY_ID);
  assert.equal(societyOfBackupKey(other), OTHER);
  assert.ok(keyBelongsTo(FIRST_SOCIETY_ID, aakar) && !keyBelongsTo(FIRST_SOCIETY_ID, other));
  assert.ok(keyBelongsTo(OTHER, other) && !keyBelongsTo(OTHER, aakar));
});

test("bad backup keys are refused", () => {
  for (const k of ["backups/../secrets.json", "backups/x/y/z.json", "notices/a.json", "backups/a.txt", `backups/${OTHER}/../a.json`, ""])
    assert.equal(isBackupKey(k), false, k);
  assert.equal(societyOfBackupKey("backups/a/b.json"), null);
});

test("logins in a backup: only that society's (a login with no membership belongs to none)", () => {
  const users = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
  const m = [{ user_id: "u1", society_id: FIRST_SOCIETY_ID }, { user_id: "u2", society_id: OTHER }];
  assert.deepEqual(loginsOfSociety(users, m, FIRST_SOCIETY_ID).map((u) => u.id), ["u1"]);
  assert.deepEqual(loginsOfSociety(users, m, OTHER).map((u) => u.id), ["u2"]);
});

test("a backup file is restored only into the society it came from; an old file (no society id) is the first society's", () => {
  assert.equal(backupSocietyError({}, FIRST_SOCIETY_ID), null);
  assert.ok(backupSocietyError({}, OTHER));
  assert.equal(backupSocietyError({ society_id: OTHER }, OTHER), null);
  assert.ok(backupSocietyError({ society_id: OTHER }, FIRST_SOCIETY_ID));
  assert.ok(backupSocietyError({ society_id: FIRST_SOCIETY_ID }, OTHER));
});

test("lib/backup.ts: every table read names the society, and a missing society_id column is an error, not a skip", () => {
  const s = read("lib/backup.ts");
  assert.match(s, /\.select\("\*"\)\.eq\("society_id", society\)\.range\(/);
  assert.match(s, /!\/society_id\/i\.test\(msg\)/);
  assert.match(s, /society_id: society/);                                  // the file says which society it is
  assert.match(s, /export async function listBackups\(society: string\)/);
  assert.match(s, /export async function keyForId\(id: string, society: string\)/);
  assert.match(s, /export async function readStoredBackup\(key: string, society: string\)/);
});

test("/api/backup: society of the caller, passed everywhere, and a foreign file is refused before anything is touched", () => {
  const s = read("app/api/backup/route.ts");
  assert.match(s, /societyOfCaller\(admin, me\.userId\)/);
  assert.match(s, /rpc\("restore_society_backup", \{ p: b, p_society: society \}\)/);
  assert.match(s, /select\("\*"\)\.eq\("society_id", society\)\.order\("at"/);          // the access log
  assert.doesNotMatch(s, /buildBackup\(admin, me\.email, "[a-z-]+"\)/);                  // no call without a society
  assert.doesNotMatch(s, /storeBackup\(\w+\)/);
  assert.ok(s.indexOf("backupSocietyError(b, society)") > 0 && s.indexOf("backupSocietyError(b, society)") < s.indexOf("buildBackup(admin, me.email, \"pre-restore\""), "check before the safety copy and the restore");
});

test("/api/docs: society_live, billing_settings, bills, receipts and letters are all read and written for the caller's society", () => {
  const s = read("app/api/docs/route.ts");
  assert.match(s, /societyOfCaller\(admin, me\.userId\)/);
  assert.match(s, /from\("society_live"\)\.select\("live_at, live_by"\)\.eq\("society_id", society\)/);
  assert.match(s, /from\("society_live"\)\.select\("id"\)\.eq\("society_id", society\)/);
  assert.match(s, /insert\(\[\{ society_id: society, id: 1/);
  assert.match(s, /p_letter: n\(L\.letter\), p_society: society/);
  assert.match(s, /from\(k\.table\)\.select\("\*"\)\.eq\("society_id", society\)/);
  assert.match(s, /from\(k\.table\)\.delete\(\)\.eq\("society_id", society\)/);
  assert.match(s, /from\("billing_settings"\)\.select\("\*"\)\.eq\("society_id", society\)/);
  assert.match(s, /\.update\(\{ \[lf\]: last - 1 \}\)\.eq\("society_id", society\)/);
  assert.doesNotMatch(s, /from\("society_live"\)\.select\("id"\)\.eq\("id", 1\)/);           // the old read with no society
  assert.doesNotMatch(s, /from\("billing_settings"\)\.select\("\*"\)\.eq\("id", 1\)/);
});

test("/api/docs: R2 test files are deleted for the caller's society only (file folders are per society since 4d-4)", () => {
  const s = read("app/api/docs/route.ts");
  assert.match(s, /all \? await deleteTestFiles\(society\)/);
});

test("every access_log row written by these two routes names the society", () => {
  for (const f of ["app/api/docs/route.ts", "app/api/backup/route.ts"]) {
    const s = read(f);
    const calls = s.split("logAccess(admin,").slice(1);
    assert.ok(calls.length >= 3, f);
    for (const c of calls) assert.match(c.slice(0, c.indexOf(";\n") + 1), /society\);$/m, `${f}: ${c.slice(0, 60)}`);
  }
});
