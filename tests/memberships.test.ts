// Multi-tenant (Nov 2026): every login the server creates also joins a society; pure helpers checked here, routes checked by reading the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FIRST_SOCIETY_ID, membershipRow } from "../lib/memberships";

const U = "11111111-2222-4333-8444-555555555555";

test("membershipRow: good input, null flat, bad ids and roles refused", () => {
  assert.deepEqual(membershipRow(U, FIRST_SOCIETY_ID, "flat", "A101"), { user_id: U, society_id: FIRST_SOCIETY_ID, role: "flat", flat_id: "A101" });
  assert.equal(membershipRow(U, FIRST_SOCIETY_ID, "committee").flat_id, null);
  assert.equal(membershipRow(U, FIRST_SOCIETY_ID, "committee", "").flat_id, null);
  assert.throws(() => membershipRow("nope", FIRST_SOCIETY_ID, "flat"));
  assert.throws(() => membershipRow(U, "nope", "flat"));
  assert.throws(() => membershipRow(U, FIRST_SOCIETY_ID, "admin" as any));
});

test("the first society id is the one in MT_01 / MT_02", () => {
  for (const f of ["multitenant/MT_01_SOCIETIES.sql", "multitenant/MT_02_SOCIETY_ID.sql"]) {
    assert.ok(readFileSync(join(__dirname, "..", f), "utf8").includes(FIRST_SOCIETY_ID), f);
  }
});

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("every place that creates a login also adds its membership", () => {
  const root = join(__dirname, "..");
  for (const f of [...files(join(root, "app")), ...files(join(root, "lib"))]) {
    const src = readFileSync(f, "utf8");
    const made = (src.match(/auth\.admin\.createUser\(/g) || []).length;
    if (!made) continue;
    const joined = (src.match(/addMembership\(/g) || []).length;
    assert.ok(joined >= made, `${f}: ${made} createUser call(s) but ${joined} addMembership call(s)`);
  }
});
