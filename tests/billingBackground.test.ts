import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("billing prints the building picture only through the first-society rule", () => {
  const src = readFileSync(join(__dirname, "..", "lib/billing.ts"), "utf8");
  assert.equal((src.match(/building-bg\.jpg/g) || []).length, 2, "one use in the gated image, one in a comment");
  assert.match(src, /const BG_IMG = \(\) => \(printsBackground\(\)/);
  assert.match(src, /hasBuildingBackground\(wordFromPath/);
  assert.doesNotMatch(src, /\$\{frameStart\}/, "frameStart is a function now");
});
