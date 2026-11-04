// PR-14: adding, resetting, linking AND removing committee logins are main admin only (checked on the server).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(__dirname, "..", "app/api/committee/route.ts"), "utf8");

test("the server refuses every login-changing action for a non-main committee login", () => {
  const m = route.match(/if \(\[([^\]]+)\]\.includes\(body\.action\) && !isMain\)/);
  assert.ok(m, "main admin guard not found");
  const actions = m![1].split(",").map((x) => x.trim().replace(/"/g, ""));
  for (const a of ["add", "reset", "link", "remove", "revoke_flat"]) assert.ok(actions.includes(a), a + " must be main admin only");
});

test("the guard runs before any action is handled", () => {
  const guard = route.indexOf("&& !isMain)");
  for (const a of ['body.action === "add"', 'body.action === "revoke_flat"', 'body.action === "reset"', 'body.action === "remove"']) {
    assert.ok(guard > 0 && guard < route.indexOf(a), a + " comes after the guard");
  }
});

test("only the main admin sees the Remove button", () => {
  const panel = readFileSync(join(__dirname, "..", "app/ledger/CommitteePanel.tsx"), "utf8");
  assert.match(panel, /iAmMain && !m\.self && !m\.main && <button onClick=\{\(\) => remove\(/);
});
