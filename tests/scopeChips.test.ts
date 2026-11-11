// PR-17: the tower filter is repeated at the top of Flat Index, Reports and Directory on phones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), "app/ledger", f), "utf8");

test("the phone tower filter is hidden from the lg breakpoint up (the sidebar does the job there)", () => {
  assert.match(read("ScopeChips.tsx"), /className="lg:hidden/);
});

test("Flat Index, Reports and Directory all use it", () => {
  for (const f of ["IndexTab.tsx", "ReportsTab.tsx", "DirectoryTab.tsx"]) {
    assert.ok(read(f).includes('import ScopeChips from "./ScopeChips"'), f);
    assert.ok(read(f).includes("<ScopeChips ctx={ctx}"), f);
  }
});

test("Reports no longer sends phone users to the sidebar only", () => {
  assert.ok(!read("ReportsTab.tsx").includes("card in the sidebar"));
});

test("the chips wrap onto a second line instead of scrolling sideways (so the Committee chip is always visible)", () => {
  const s = read("ScopeChips.tsx");
  assert.ok(s.includes("flex flex-wrap gap-2"));
  assert.ok(!s.includes("overflow-x-auto"));
});
