// Committee = role "committee" only. A login with no role, or any other value, must get no access.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommitteeMeta, isResidentMeta, roleOf } from "../lib/roles";

test("only role committee is committee", () => {
  assert.equal(isCommitteeMeta({ role: "committee", flat_id: "A503" }), true);
  for (const m of [{}, null, undefined, { role: "" }, { role: "admin" }, { role: "resident" }, { role: "Committee" }, { provider: "email" }])
    assert.equal(isCommitteeMeta(m), false, JSON.stringify(m));
});

test("flat logins are resident", () => {
  assert.equal(isResidentMeta({ role: "resident", flat_id: "A503" }), true);
  assert.equal(isResidentMeta({ role: "committee" }), false);
});

test("unknown or missing role means no access", () => {
  assert.equal(roleOf({ provider: "email", providers: ["email"] }), null);
  assert.equal(roleOf({ role: "superuser" }), null);
});
