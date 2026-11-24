// Multi-tenant step 4a (Nov 2026): MT_03 keeps today's main-admin ordering, and its undo restores the old functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const mt03 = read("multitenant/MT_03_ACTIVE_SOCIETY.sql");
const undo = read("multitenant/MT_03_UNDO.sql");
const oldAdmin = read("AREAS_BACKUPS.sql");
const oldCommittee = read("sql-security/02_IS_COMMITTEE_strict.sql");

test("main admin stays the oldest committee login (same ordering as AREAS_BACKUPS.sql)", () => {
  assert.match(oldAdmin, /order by u\.created_at, u\.id limit 1/);
  const fn = mt03.slice(mt03.indexOf("function public.is_main_admin()"));
  assert.ok((fn.match(/order by u\.created_at, u\.id limit 1/g) || []).length >= 2, "both branches keep the login-age ordering");
});

test("committee still needs role 'committee' in app_metadata, plus a membership of the active society", () => {
  const fn = mt03.slice(mt03.indexOf("function public.is_committee()"), mt03.indexOf("function public.is_main_admin()"));
  assert.match(fn, /raw_app_meta_data ->> 'role' = 'committee'/);
  assert.match(fn, /m\.society_id = public\.active_society\(\)/);
  assert.match(fn, /'committee', 'society_admin'/);
});

test("undo puts the old definitions back", () => {
  assert.match(undo, /raw_app_meta_data ->> 'role' = 'committee'/);
  assert.doesNotMatch(undo.slice(undo.indexOf("function public.is_committee()"), undo.indexOf("function public.is_main_admin()")), /society_memberships/);
  assert.match(oldCommittee, /raw_app_meta_data ->> 'role' = 'committee'/);
  assert.match(undo, /drop function if exists public\.active_society\(\)/);
});

test("active_society is closed to anon", () => {
  assert.match(mt03, /revoke all on function public\.active_society\(\) from public, anon/);
});
