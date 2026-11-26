// Multi-tenant step 4d-4: R2 files are per society. The first society keeps today's keys; every other society's keys start with s/<society id>/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { folderOfKey, keyInSociety, keyPrefixOf, keyWithoutPrefix, parseFileRef, societyOfKey } from "../lib/r2Keys";
import { FIRST_SOCIETY_ID } from "../lib/memberships";

const S2 = "b5b5b5b5-0000-4000-8000-000000000002";
const BASE = "https://pub-abc.r2.dev";

test("first society: no prefix, keys and folders exactly as before", () => {
  assert.equal(keyPrefixOf(FIRST_SOCIETY_ID), "");
  assert.equal(societyOfKey("notices/1_a.jpg"), FIRST_SOCIETY_ID);
  assert.equal(folderOfKey("vault/society-registration.pdf"), "vault");
  assert.deepEqual(parseFileRef(`${BASE}/flats/A503/1_deed.pdf`, [BASE]), { kind: "r2", key: "flats/A503/1_deed.pdf", folder: "flats/A503" });
});

test("another society: s/<id>/ prefix, same logical folders", () => {
  assert.equal(keyPrefixOf(S2.toUpperCase()), `s/${S2}/`);
  const key = `s/${S2}/flats/A101/1_x.pdf`;
  assert.equal(societyOfKey(key), S2);
  assert.equal(keyWithoutPrefix(key), "flats/A101/1_x.pdf");
  assert.equal(folderOfKey(key), "flats/A101");
  assert.equal(folderOfKey(`s/${S2}/vault/slot.pdf`), "vault");
  assert.deepEqual(parseFileRef(`${BASE}/${key}`, [BASE]), { kind: "r2", key, folder: "flats/A101" });
  assert.deepEqual(parseFileRef(key, [BASE]), { kind: "r2", key, folder: "flats/A101" });
});

test("a key belongs to exactly one society", () => {
  assert.ok(keyInSociety("notices/1_a.jpg", FIRST_SOCIETY_ID));
  assert.ok(!keyInSociety("notices/1_a.jpg", S2));
  assert.ok(keyInSociety(`s/${S2}/notices/1_a.jpg`, S2));
  assert.ok(!keyInSociety(`s/${S2}/notices/1_a.jpg`, FIRST_SOCIETY_ID));
  assert.ok(keyInSociety("backups/x.json", FIRST_SOCIETY_ID) && !keyInSociety("backups/x.json", S2));
  assert.ok(keyInSociety(`backups/${S2}/x.json`, S2) && !keyInSociety(`backups/${S2}/x.json`, FIRST_SOCIETY_ID));
});

test("odd prefixes are refused", () => {
  for (const bad of ["s/not-a-uuid/notices/x.jpg", `s/${S2}/payproofs/A101/x.jpg`, `s/${S2}/notices/../vault/x.pdf`, `s/${S2}/s/${S2}/notices/x.jpg`, `s/${S2}/x.jpg`])
    assert.equal(folderOfKey(bad), null, bad);
});

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
test("file routes: every R2 key is built with the caller's society prefix and checked against it", () => {
  const f = read("app/api/file/route.ts");
  assert.match(f, /Prefix: `\$\{prefix\}\$\{folder\}\/`/);
  assert.match(f, /`\$\{prefix\}vault\/\$\{slot\}\.\$\{ext\}`/);
  assert.match(f, /`\$\{prefix\}\$\{folder\}\/\$\{Date\.now\(\)\}/);
  assert.match(f, /societyOfKey\(key\) !== \(await callerSociety\(me\)\)\.toLowerCase\(\)/);
  const a = read("lib/r2Access.ts");
  assert.match(a, /societyOfKey\(it\.key\) !== society\.toLowerCase\(\)/);
  assert.match(a, /allowedKeys\(me, r2Items, await callerSociety\(me\)\)/);
});
test("storage and clear: only the caller's society", () => {
  assert.match(read("app/api/storage/route.ts"), /keyInSociety\(o\.Key, society\)/);
  assert.match(read("lib/r2Clear.ts"), /keyPrefixOf\(society\) \+ folder/);
});
test("screens match vault slot files without the society prefix", () => {
  for (const f of ["app/ledger/VaultTab.tsx", "app/ledger/DetailTab.tsx"]) assert.ok(!/\.key\.startsWith\(`vault\//.test(read(f)), f + " compares the raw key");
});
