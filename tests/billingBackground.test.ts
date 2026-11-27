import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("billing prints the building picture only through the first-society rule", () => {
  const src = readFileSync(join(__dirname, "..", "lib/billing.ts"), "utf8");
  assert.equal((src.match(/building-bg\.jpg/g) || []).length, 1, "only in a comment; the path itself lives in lib/printBackground.ts");
  assert.match(src, /const BG_IMG = \(\) => \{ const src = backgroundNow\(\);/);
  assert.match(src, /hasBuildingBackground\(wordFromPath/);
  assert.doesNotMatch(src, /\$\{frameStart\}/, "frameStart is a function now");
});
