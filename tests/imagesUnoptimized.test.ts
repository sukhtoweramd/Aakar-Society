// Audit PR-8: the app never uses next/image, so the built-in image optimizer (/_next/image) stays switched off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(join(root, "next.config.js"));

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("next.config.js turns the image optimizer off", () => {
  assert.equal(config.images?.unoptimized, true);
});

test("no screen imports next/image (if one ever does, review this setting on purpose)", () => {
  for (const d of ["app", "lib"]) for (const f of files(join(root, d))) {
    assert.ok(!/from\s+["']next\/image["']/.test(readFileSync(f, "utf8")), `${f} imports next/image`);
  }
});
