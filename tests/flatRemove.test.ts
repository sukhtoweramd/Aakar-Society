// Removing flats that hold no data (19 Nov 2026). Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canRemoveAll, removeSummary, removeText } from "../lib/flatRemove";

const empty = (id: string) => ({ flat_id: id, blockers: "" });
const held = (id: string, why = "owner_name, members.flat_id (3)") => ({ flat_id: id, blockers: why });

test("removal is allowed only when there is at least one flat and every flat is empty", () => {
  assert.equal(canRemoveAll([]), false);
  assert.equal(canRemoveAll([empty("D101"), empty("D102")]), true);
  assert.equal(canRemoveAll([empty("D101"), held("D102")]), false);
});

test("texts and summary", () => {
  assert.equal(removeText([]), "No flats found.");
  assert.equal(removeText([empty("D101")]), "This flat holds no data and can be removed.");
  assert.equal(removeText([empty("D101"), empty("D102")]), "All 2 flats hold no data and can be removed.");
  assert.equal(removeText([empty("D101"), held("D102")]), "1 of 2 flats hold data, so nothing can be removed.");
  const s = removeSummary(Array.from({ length: 12 }, (_, i) => held(`D${i}01`)), 3);
  assert.equal(s.held, 12);
  assert.equal(s.examples.length, 3);
});

test("server route: main admin only, asks the database function, checks again before deleting, never shows owner data", () => {
  const r = readFileSync("app/api/flat-remove/route.ts", "utf8");
  assert.match(r, /isMainAdminUser/);
  assert.match(r, /rpc\("flat_blockers"/);
  assert.match(r, /canRemoveAll\(rows\)/);
  assert.ok(r.indexOf("canRemoveAll(rows)") < r.indexOf('.delete().eq("society_id", society).in("id"'));
  assert.match(r, /Run sql-security\/15/);
  // step 4d: the server key skips the society wall, so every read and write names the caller's society (a flat id alone is not unique any more)
  assert.match(r, /societyOfCaller\(admin, me\.userId\)/);
  assert.match(r, /from\("flats"\)\.select\("id, tower"\)\.eq\("society_id", society\)/);
  assert.match(r, /rpc\("flat_blockers", \{ p_flats: ids, p_society: society \}\)/);
  assert.doesNotMatch(r, /\.delete\(\)\.in\(/, "never delete flats by id alone");
  const logs = r.split("\n").filter((l) => l.includes("logAccess(") && !l.includes("import "));
  assert.ok(logs.length >= 3 && logs.every((l) => /, society\);/.test(l)), "every access-log row names the society");
  assert.match(r, /multitenant\/MT_11/);
  assert.doesNotMatch(r, /owner_name|owner_mobile|owner_address/);
});

test("SQL 15: read-only function closed to anon and members, covers foreign keys, flat_id columns, areas and logins; has a check and an UNDO", () => {
  const q = readFileSync("sql-security/15_FLAT_EMPTY_CHECK.sql", "utf8");
  assert.match(q, /revoke all on function public\.flat_blockers\(text\[\]\) from public, anon, authenticated/);
  assert.match(q, /grant execute on function public\.flat_blockers\(text\[\]\) to service_role/);
  for (const w of ["contype = 'f'", "'flat_id'", "backup_flats", "raw_app_meta_data", "tenant_flat", "committee_members", "'filled', 'occupied'"]) assert.ok(q.includes(w), w);
  assert.doesNotMatch(q, /\bdelete from|\bupdate public|\binsert into|\btruncate\b/i);
  assert.match(readFileSync("sql-security/15_UNDO.sql", "utf8"), /drop function if exists public\.flat_blockers/);
});

test("screen: main admin only, phone first, no table, pure helper", () => {
  const c = readFileSync("app/ledger/FlatRemover.tsx", "utf8");
  assert.match(c, /isMain !== true/);
  assert.match(c, /min-h-\[44px\]/);
  assert.match(c, /min-w-0/);
  assert.doesNotMatch(c, /<table/);
  assert.doesNotMatch(readFileSync("lib/flatRemove.ts", "utf8"), /^import .*supabaseClient/m);
});
