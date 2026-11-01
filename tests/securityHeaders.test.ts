// Audit PR-2: security headers are configured in next.config.js and the risky ones stay out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(join(__dirname, "..", "next.config.js"));

async function headerMap(): Promise<Record<string, string>> {
  const rules = await config.headers();
  const rule = rules.find((r: { source: string }) => r.source === "/(.*)");
  assert.ok(rule, "a rule for every route (/(.*)) must exist");
  return Object.fromEntries(rule.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
}

test("basic security headers are set on every route", async () => {
  const h = await headerMap();
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(h["Permissions-Policy"], /camera=\(\)/);
  assert.match(h["Permissions-Policy"], /geolocation=\(\)/);
});

test("CSP is report-only and blocks plugins, framing and base-tag tricks", async () => {
  const h = await headerMap();
  assert.equal(h["Content-Security-Policy"], undefined, "CSP must not be enforced in this PR");
  const csp = h["Content-Security-Policy-Report-Only"];
  assert.ok(csp);
  for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"]) assert.ok(csp.includes(d), d);
  assert.ok(!csp.includes("'unsafe-eval'"), "no unsafe-eval");
});

test("headers that would break the print windows stay out", async () => {
  const h = await headerMap();
  assert.equal(h["Cross-Origin-Opener-Policy"], undefined);
  assert.equal(h["Cross-Origin-Embedder-Policy"], undefined);
});
