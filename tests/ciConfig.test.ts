// Audit PR-7: the CI audit step must never block a merge, and Dependabot must stay quiet (monthly, grouped, no major jumps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const dep = readFileSync(join(root, ".github/dependabot.yml"), "utf8");

test("CI: the audit step is report-only (continue-on-error) and runs after the build", () => {
  const i = ci.indexOf("Dependency audit (report only)");
  assert.ok(i > ci.indexOf("npm run build"), "audit comes after the build");
  const step = ci.slice(i);
  assert.match(step, /continue-on-error:\s*true/);
  assert.match(step, /npm audit --omit=dev/);
  assert.match(ci, /permissions:\s*\n\s*contents:\s*read/);
});

test("Dependabot: monthly, grouped small updates, major versions ignored, few open PRs", () => {
  assert.ok(!/interval:\s*(daily|weekly)/.test(dep));
  assert.match(dep, /interval:\s*monthly/);
  assert.match(dep, /semver-major/);
  assert.match(dep, /groups:/);
  for (const m of dep.matchAll(/open-pull-requests-limit:\s*(\d+)/g)) assert.ok(Number(m[1]) <= 2);
});
