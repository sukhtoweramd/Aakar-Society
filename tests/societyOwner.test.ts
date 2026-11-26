// Multi-tenant step 4d-2: who is the society owner ("main admin") of a society. Pure rule in lib/societyOwner.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { committeeOfSociety, ownerByEmailOrOldest, societyOwnerId } from "../lib/societyOwner";
import { FIRST_SOCIETY_ID } from "../lib/memberships";

const S2 = "b5b5b5b5-0000-4000-8000-000000000002";
const S3 = "c6c6c6c6-0000-4000-8000-000000000003";
const u = (id: string, email: string, created: string, role = "committee") => ({ id, email, created_at: created, app_metadata: { role } });
const m = (user_id: string, society_id: string, role = "committee") => ({ user_id, society_id, role });

const first1 = u("u1", "old@first.test", "2026-01-01"), first2 = u("u2", "chair@first.test", "2026-02-01");
const sg1 = u("u3", "owner@sg.test", "2026-03-01"), sg2 = u("u4", "other@sg.test", "2026-02-15"), flat = u("u5", "a101@flats.x", "2026-01-01", "resident");
const users = [first1, first2, sg1, sg2, flat];
const mem = [m("u1", FIRST_SOCIETY_ID), m("u2", FIRST_SOCIETY_ID), m("u3", S2, "society_admin"), m("u4", S2), m("u5", FIRST_SOCIETY_ID, "flat")];

test("first society: the oldest committee login owns it", () => {
  assert.equal(societyOwnerId(users, mem, FIRST_SOCIETY_ID), "u1");
});
test("first society: MAIN_ADMIN_EMAIL wins when that login belongs to the society", () => {
  assert.equal(societyOwnerId(users, mem, FIRST_SOCIETY_ID, "Chair@First.test"), "u2");
});
test("first society: MAIN_ADMIN_EMAIL naming a login of another society is ignored", () => {
  assert.equal(societyOwnerId(users, mem, FIRST_SOCIETY_ID, "owner@sg.test"), "u1");
});
test("another society: its society_admin owns it, even if another committee login is older", () => {
  assert.equal(societyOwnerId(users, mem, S2), "u3");
});
test("another society: MAIN_ADMIN_EMAIL has no effect", () => {
  assert.equal(societyOwnerId(users, mem, S2, "old@first.test"), "u3");
});
test("another society with no society_admin yet: the oldest committee login of that society", () => {
  const mem2 = mem.map((x) => (x.user_id === "u3" ? { ...x, role: "committee" } : x));
  assert.equal(societyOwnerId(users, mem2, S2), "u4");
});
test("a login of another society is never the owner, and a society without committee logins has no owner", () => {
  assert.equal(societyOwnerId(users, mem, S3), null);
  assert.deepEqual(committeeOfSociety(users, mem, S2).map((x) => x.id).sort(), ["u3", "u4"]);
  assert.ok(!committeeOfSociety(users, mem, FIRST_SOCIETY_ID).some((x) => x.id === "u3"));
});
test("flat logins never count; a committee login with no membership counts as the first society's", () => {
  assert.ok(!committeeOfSociety(users, mem, FIRST_SOCIETY_ID).some((x) => x.id === "u5"));
  const loose = u("u9", "loose@first.test", "2025-12-01");
  assert.equal(societyOwnerId([...users, loose], mem, FIRST_SOCIETY_ID), "u9");
  assert.equal(societyOwnerId([...users, loose], mem, S2), "u3");
});
test("ownerByEmailOrOldest: empty list gives null", () => {
  assert.equal(ownerByEmailOrOldest([], "x@y.z"), null);
});

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
test("routes use the one rule: no route picks the main admin from all logins of the project", () => {
  for (const f of ["app/api/backup/route.ts", "app/api/docs/route.ts", "app/api/committee/route.ts", "lib/mainAdmin.ts"]) {
    const t = read(f);
    assert.ok(!/mainAdminId\(/.test(t), f + " still uses mainAdminId");
    assert.ok(!/allUsers\([^)]*\)\)\.filter\(isCommitteeUser\)/.test(t), f + " still lists every committee login of the project");
  }
  assert.match(read("lib/mainAdmin.ts"), /societyOfCaller\(admin, userId\)/);
});
