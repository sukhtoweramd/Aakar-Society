// Flat setup tables (draft 19 Nov 2026): the seed must equal what the code has today, and the script must never touch flats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOCIETY, TERRACE_TOWERS } from "../lib/society";

const sql = readFileSync("FLAT_SETUP_TABLES.sql", "utf8");
const undo = readFileSync("FLAT_SETUP_TABLES_UNDO.sql", "utf8");
const snapshot = readFileSync("FLAT_SETUP_SNAPSHOT.sql", "utf8");
// SQL without comments, to look at the statements only
const code = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

test("the society profile seed equals SOCIETY in lib/society.ts", () => {
  const m = code(sql).match(/insert into public\.society_profile[\s\S]*?values \(1,([\s\S]*?)\)\s*on conflict/);
  assert.ok(m, "profile insert not found");
  const lit = Array.from(m![1].matchAll(/'((?:[^']|'')*)'/g), (x) => x[1].replace(/''/g, "'"));
  assert.deepEqual(lit, [SOCIETY.name, SOCIETY.full, SOCIETY.reg, SOCIETY.regDate, SOCIETY.building, SOCIETY.address,
    ...SOCIETY.addressLines, SOCIETY.city, "https://aakarsociety.vercel.app"]);
});

test("the terrace towers seed equals TERRACE_TOWERS", () => {
  const m = code(sql).match(/t\.code in \(([^)]*)\)/);
  assert.ok(m, "terrace list not found");
  assert.deepEqual(Array.from(m![1].matchAll(/'([^']+)'/g), (x) => x[1]), TERRACE_TOWERS);
});

test("towers are read from the flats, not typed in", () => {
  assert.match(code(sql), /select distinct trim\(tower\) as code from public\.flats/);
});

test("the script never changes the flats table", () => {
  const s = code(sql).toLowerCase() + code(undo).toLowerCase() + code(snapshot).toLowerCase();
  assert.doesNotMatch(s, /(insert\s+into|update|delete\s+from|alter\s+table|drop\s+table(\s+if\s+exists)?|truncate(\s+table)?)\s+public\.flats\b/);
});

test("both tables: row security, only the main admin writes, anon has nothing, grants as the repo rule says", () => {
  const s = code(sql);
  for (const t of ["society_profile", "towers"]) {
    assert.match(s, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(s, new RegExp(`revoke all on public\\.${t} from anon`));
    assert.match(s, new RegExp(`grant select, insert, update, delete on public\\.${t} to authenticated, service_role`));
    assert.match(s, new RegExp(`on public\\.${t} for insert to authenticated with check \\(public\\.is_main_admin\\(\\)\\)`));
    assert.match(s, new RegExp(`on public\\.${t} for update to authenticated using \\(public\\.is_main_admin\\(\\)\\)`));
  }
  assert.match(s, /on public\.towers for delete to authenticated using \(public\.is_main_admin\(\)\)/);
  assert.doesNotMatch(s, /to anon/i);
});

test("a tower used by flats cannot be deleted or re-coded", () => {
  assert.match(sql, /create trigger towers_guard before update or delete on public\.towers/);
  assert.match(sql, /cannot be deleted/);
});

test("the setup tables are backed up and restored, and never cleared by CLEAR TEST DOCUMENTS", () => {
  const backup = readFileSync("lib/backup.ts", "utf8");
  const restore = readFileSync("sql-security/14_RESTORE_flat_setup_tables.sql", "utf8");
  const clear = readFileSync("sql-security/12_CLEAR_TEST_ALL.sql", "utf8");
  const tabs = clear.slice(clear.indexOf("tabs text[] := array["), clear.indexOf("];", clear.indexOf("tabs text[] := array[")));
  for (const t of ["society_profile", "towers"]) {
    assert.match(backup, new RegExp(`"${t}"`));
    assert.match(restore, new RegExp(`'${t}'`));
    assert.doesNotMatch(tabs, new RegExp(`'${t}'`));
  }
});

test("restore script 14 differs from script 10 only by the two tables at the front of the list", () => {
  const fn = (f: string) => { const s = readFileSync(f, "utf8"); return s.slice(s.indexOf("create or replace function"), s.indexOf("grant execute on function public.restore_society_backup(jsonb) to service_role;")); };
  const a = fn("sql-security/10_RESTORE_letter_templates.sql");
  const b = fn("sql-security/14_RESTORE_flat_setup_tables.sql");
  assert.equal(b.replace("array['society_profile','towers','flats',", "array['flats',"), a);
  assert.equal(fn("sql-security/14_UNDO.sql"), a);
});
