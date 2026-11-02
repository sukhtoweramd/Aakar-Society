import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

// PR-11: pdfjs-dist 6.x clears the audit chain (tar, canvas, node-pre-gyp, glob, minimatch, rimraf)
// and fixes CVE-2024-4367 (patched in 4.2.67).
test("pdfjs-dist is pinned to a 6.x release", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.dependencies["pdfjs-dist"], /^6\.\d+\.\d+$/);
});

test("the worker file named in compressFile.ts exists in pdfjs-dist", () => {
  const src = readFileSync(join(root, "lib/compressFile.ts"), "utf8");
  const m = src.match(/new URL\("pdfjs-dist\/([^"]+)"/);
  assert.ok(m, "worker path not found");
  assert.ok(existsSync(join(root, "node_modules/pdfjs-dist", m![1])), `missing ${m![1]}`);
});
