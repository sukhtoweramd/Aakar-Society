// Audit PR-3: the small limiter, and a source check that pdf.js is opened with eval turned off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeLimiter } from "../lib/rateLimit";

const root = join(__dirname, "..");

test("limiter: the 9th call inside a minute is blocked, 8 are allowed", () => {
  let t = 1000; const allow = makeLimiter(8, 60_000, () => t);
  for (let i = 0; i < 8; i++) assert.equal(allow("u1"), true, `call ${i + 1}`);
  assert.equal(allow("u1"), false);
  assert.equal(allow("u1"), false);
});

test("limiter: the window resets and logins do not affect each other", () => {
  let t = 0; const allow = makeLimiter(2, 60_000, () => t);
  assert.ok(allow("a")); assert.ok(allow("a")); assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  t = 61_000;
  assert.equal(allow("a"), true);
});

test("limiter: blocked calls are not counted", () => {
  let t = 0; const allow = makeLimiter(1, 1000, () => t);
  assert.ok(allow("a")); t = 500; assert.equal(allow("a"), false);
  t = 1001; assert.equal(allow("a"), true); // first hit aged out; the blocked one at 500 did not extend the lock
});

test("every pdfjs getDocument call turns eval off (CVE-2024-4367 workaround)", () => {
  for (const f of ["lib/compressFile.ts"]) {
    const src = readFileSync(join(root, f), "utf8");
    const calls = src.match(/getDocument\(\{[^}]*\}\)/g) || [];
    assert.ok(calls.length >= 1, `${f}: no getDocument call found`);
    for (const c of calls) assert.match(c, /isEvalSupported:\s*false/, `${f}: ${c}`);
  }
});

test("read-payment uses the limiter before reading an image, and does not limit the committee check/agree actions", () => {
  const src = readFileSync(join(root, "app/api/read-payment/route.ts"), "utf8");
  const lim = src.indexOf("allowRead(me.userId)");
  assert.ok(lim > 0, "limiter call missing");
  assert.ok(lim > src.indexOf('form.get("action") === "agree"'), "limiter must come after the admin actions");
  assert.ok(lim < src.indexOf('let dataUrl'), "limiter must come before the image is read");
  assert.match(src, /status: 429/);
});
