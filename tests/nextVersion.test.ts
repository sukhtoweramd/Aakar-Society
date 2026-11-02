// Audit PR-10: Next.js is on a supported, patched line (15.5.28 or later 15.5.x), with the React 18 the app is built on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const installed = JSON.parse(readFileSync(join(root, "node_modules/next/package.json"), "utf8")).version as string;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("installed Next.js is 15.5.28 or newer on the 15.5 line", () => {
  const m = installed.match(/^15\.5\.(\d+)$/);
  assert.ok(m, `unexpected Next version ${installed}`);
  assert.ok(Number(m![1]) >= 28, `Next ${installed} is older than 15.5.28 (known critical advisories)`);
});

test("package.json pins the same Next version", () => {
  assert.match(pkg.dependencies.next, /^15\.5\.(2[8-9]|[3-9]\d)$/);
});

test("the app still uses the request APIs that changed in Next 15 only in the old-safe way (no cookies()/headers() calls)", () => {
  // Next 15 made cookies(), headers() and route params async. If a screen starts using them, it must await them.
  for (const f of ["app/api/backup/route.ts", "app/api/file/route.ts", "app/api/payment-proof/route.ts"]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.ok(!/\bcookies\(\)|\bheaders\(\)/.test(src), `${f} uses cookies()/headers(): check it is awaited`);
  }
});
