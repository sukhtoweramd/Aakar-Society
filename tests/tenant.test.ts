// Tenant logins (30 Oct 2026): login names, what a tenant may open, which screens. Sample flats only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatEmail, parseLogin, tenantEmail } from "../lib/residents";
import { folderAccess } from "../lib/r2Keys";
import { tenantTabs } from "../lib/memberTabs";
import { roleOf } from "../lib/roles";

test("tenant logs in with the flat number + T; the owner with the flat number", () => {
  for (const s of ["A-101-T", "a101t", "A 101 T", "A-101 tenant", "a-101-T "]) assert.deepEqual(parseLogin(s), { flat: "A101", tenant: true }, s);
  assert.deepEqual(parseLogin("A-101"), { flat: "A101", tenant: false });
  assert.deepEqual(parseLogin("B-202-T"), { flat: "B201", tenant: true });   // joined 4 BHK home
  assert.equal(parseLogin("T"), null);
  assert.equal(parseLogin("tenant"), null);
  assert.notEqual(tenantEmail("A101"), flatEmail("A101"));
  assert.match(tenantEmail("A101"), /^a101\.tenant@/);
});

test("the tenant role is known; unknown roles still get nothing", () => {
  assert.equal(roleOf({ role: "tenant" }), "tenant");
  assert.equal(roleOf({ role: "owner" }), null);
});

test("files: a tenant opens its own complaint photos, never the owner's documents", () => {
  const tenant = { isCommittee: false, flatId: null, tenantFlatId: "A101" };
  assert.equal(folderAccess("complaints/A101", tenant), "yes");
  assert.equal(folderAccess("flats/A101", tenant), "no");
  assert.equal(folderAccess("complaints/A102", tenant), "record");
  assert.equal(folderAccess("amc", tenant), "no");
  assert.equal(folderAccess("notices", tenant), "yes");
  assert.equal(folderAccess("events/00000000-0000-0000-0000-000000000000", tenant), "yes");
});

test("tenant screens: MY FLAT, NOTICES, CONTACTS, EVENTS (+ COVER if shown to members); never VAULT or DIRECTORY", () => {
  assert.deepEqual(tenantTabs(null), ["COVER", "DETAIL", "NOTICES", "CONTACTS", "EVENTS"]);
  assert.deepEqual(tenantTabs(["EVENTS", "VAULT", "DIRECTORY"]), ["DETAIL", "NOTICES", "EVENTS"]);
});
