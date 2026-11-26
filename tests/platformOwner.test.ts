import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { firstProfileRow, hasNoRole, isPlatformOwner, newSocietyInput, societyList } from "../lib/platformOwner";
import { FIRST_SOCIETY_ID } from "../lib/memberships";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const S2 = "c4c4c4c4-0000-4000-8000-000000000003";

test("product owner: variable set, same email, and no society membership", () => {
  assert.equal(isPlatformOwner("Owner@x.com", "owner@x.com", 0), true);
  assert.equal(isPlatformOwner("owner@x.com", "owner@x.com", 1), false);   // belongs to a society
  assert.equal(isPlatformOwner("other@x.com", "owner@x.com", 0), false);
  assert.equal(isPlatformOwner("owner@x.com", "", 0), false);              // variable not set
  assert.equal(isPlatformOwner("", "", 0), false);
});

test("a login with a role is never the product owner login", () => {
  assert.equal(hasNoRole({}), true);
  assert.equal(hasNoRole(null), true);
  assert.equal(hasNoRole({ role: "committee" }), false);
  assert.equal(hasNoRole({ role: "resident", flat_id: "A101" }), false);
});

test("new society form: name, word and owner email are checked", () => {
  assert.deepEqual(newSocietyInput({ name: "  Green   Park ", word: "Green-Park", ownerEmail: " A@B.com " }), { name: "Green Park", word: "green-park", ownerEmail: "a@b.com" });
  assert.throws(() => newSocietyInput({ name: "ab", word: "green-park", ownerEmail: "a@b.com" }), /name/);
  assert.throws(() => newSocietyInput({ name: "Green Park", word: "platform", ownerEmail: "a@b.com" }), /word/);
  assert.throws(() => newSocietyInput({ name: "Green Park", word: "x", ownerEmail: "a@b.com" }), /word/);
  assert.throws(() => newSocietyInput({ name: "Green Park", word: "green-park", ownerEmail: "nope" }), /email/);
  assert.throws(() => newSocietyInput({ name: "Green Park", word: "green-park", ownerEmail: "a101@flats.aakarsociety.app" }), /flat login/);
});

test("first profile row has the society's own name and nothing of Aakar's", () => {
  const r = firstProfileRow(S2, "Green Park");
  assert.deepEqual(Object.keys(r).sort(), ["full_name", "id", "name", "society_id"]);
  assert.equal(r.name, "Green Park");
});

test("society list is counts only and finds each society's owner", () => {
  const users = [
    { id: "u1", email: "a@x.com", created_at: "2026-01-01", app_metadata: { role: "committee" } },
    { id: "u2", email: "o@y.com", created_at: "2026-02-01", app_metadata: { role: "committee" } },
    { id: "u3", email: "f@y.com", created_at: "2026-02-02", app_metadata: { role: "resident", flat_id: "A101" } },
  ];
  const mem = [
    { user_id: "u1", society_id: FIRST_SOCIETY_ID, role: "committee" },
    { user_id: "u2", society_id: S2, role: "society_admin" },
    { user_id: "u3", society_id: S2, role: "flat" },
  ];
  const list = societyList(
    [{ id: S2, slug: "y", name: "Y", status: "active", created_at: "2026-02-01" }, { id: FIRST_SOCIETY_ID, slug: "aakar", name: "A", status: "active", created_at: "2026-01-01" }],
    users, mem, { [S2]: 24 });
  assert.equal(list[0].slug, "aakar");
  assert.equal(list[1].owner_email, "o@y.com");
  assert.deepEqual(list[1].logins, { committee: 1, flat: 1, tenant: 0 });
  assert.equal(list[1].flats, 24);
  assert.deepEqual(Object.keys(list[1]).sort(), ["created_at", "flats", "id", "logins", "name", "owner_email", "slug", "status"]);
});

test("the platform route checks the product owner on the server, writes nothing without it, and the page is not a society word", () => {
  const r = read("app/api/platform/route.ts");
  assert.match(r, /isPlatformOwner\(/);
  assert.match(r, /PLATFORM_OWNER_EMAIL/);
  assert.match(r, /hasNoRole\(/);
  const guardAt = r.indexOf("await guard(req)");
  assert.ok(guardAt > 0 && r.indexOf("admin.from(\"societies\").insert") > guardAt);
  const tables = (r.match(/\.from\("[a-z_]+"\)/g) || []).map((m) => m.slice(7, -2));
  assert.deepEqual(Array.from(new Set(tables)).sort(), ["flats", "societies", "society_memberships", "society_profile"], "the platform route may touch only these tables (flats: a count)");
  assert.ok(!/owner_name|mobile/.test(r.replace(/\/\/.*$/gm, "")), "no resident data");
  assert.ok(read("lib/societyWord.ts").includes('"platform"'));
});
