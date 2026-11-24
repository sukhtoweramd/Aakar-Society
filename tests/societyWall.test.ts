// Multi-tenant step 4b (Nov 2026): the society wall covers exactly the tables that MT_02 gave a society_id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const list = (sql: string) => {
  const m = sql.match(/tabs text\[\] := array\[([\s\S]*?)\];/);
  assert.ok(m, "table list not found");
  return Array.from(m![1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
};

test("the wall covers the same tables as MT_02, once each", () => {
  const wall = list(read("multitenant/MT_04_SOCIETY_WALL.sql"));
  const mt02 = list(read("multitenant/MT_02_SOCIETY_ID.sql"));
  assert.deepEqual([...wall].sort(), [...mt02].sort());
  assert.equal(new Set(wall).size, wall.length);
});

test("the wall rule is restrictive, for logged-in logins, on both reading and writing, with a cached society lookup", () => {
  const sql = read("multitenant/MT_04_SOCIETY_WALL.sql");
  assert.match(sql, /as restrictive for all to authenticated/);
  assert.match(sql, /using \(society_id = \(select public\.active_society\(\)\)\)/);
  assert.match(sql, /with check \(society_id = \(select public\.active_society\(\)\)\)/);
});

test("undo drops every wall", () => {
  assert.match(read("multitenant/MT_04_UNDO.sql"), /drop policy if exists society_wall/);
});
