// A reply the screen cannot read says why, and still starts with "Server error <status>".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { badReplyMessage } from "../lib/apiReply";

test("cut-off reply names the network error and the request ref", () => {
  const m = badReplyMessage({ status: 200, readError: "TypeError network error", contentType: "application/json; charset=utf-8", ref: "bom1::abc12-123" });
  assert.match(m, /^Server error 200 \(/);
  assert.match(m, /cut off on the way: TypeError network error/);
  assert.match(m, /application\/json/);
  assert.doesNotMatch(m, /charset/);
  assert.match(m, /ref bom1::abc12-123/);
});

test("empty reply and not-JSON reply are told apart", () => {
  assert.match(badReplyMessage({ status: 200, body: "  " }), /the reply was empty/);
  assert.match(badReplyMessage({ status: 502, body: "<html>\n  Bad   gateway </html>" }), /not JSON: <html> Bad gateway <\/html>/);
});

test("a long page is cut to 80 characters", () => {
  const m = badReplyMessage({ status: 500, body: "x".repeat(500) });
  assert.ok(m.length < 200);
});

test("api() uses it and keeps the old rules for good replies", () => {
  const src = readFileSync(join(__dirname, "..", "lib", "ledgerClient.ts"), "utf8");
  assert.match(src, /badReplyMessage\(/);
  assert.match(src, /if \(!res\.ok \|\| j\.error\) throw new Error\(j\.error \|\| `Server error \$\{res\.status\}`\)/);
});
