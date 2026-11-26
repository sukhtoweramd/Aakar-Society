import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { letterPrefixFallback, nextYearExample } from "../lib/billingPrefix";

test("example moves the society's own prefix to the next year", () => {
  assert.equal(nextYearExample("TP/26-27/"), "TP/27-28/");
  assert.equal(nextYearExample("AKR/O/26-27/"), "AKR/O/27-28/");
  assert.equal(nextYearExample("TP/98-99/"), "TP/99-00/");
  assert.equal(nextYearExample(""), "XYZ/27-28/");
  assert.equal(nextYearExample("NOYEAR/"), "XYZ/27-28/");
});

test("empty letter prefix falls back to the society's own code", () => {
  assert.equal(letterPrefixFallback("TP/26-27/"), "TP/L/26-27/");
  assert.equal(letterPrefixFallback("AKR/26-27/"), "AKR/L/26-27/");
  assert.equal(letterPrefixFallback(""), "L/");
  assert.equal(letterPrefixFallback(null), "L/");
});

test("no society's letters typed into the billing settings screen", () => {
  const s = readFileSync(join(__dirname, "..", "app/ledger/billing/BillingSettings.tsx"), "utf8");
  assert.doesNotMatch(s, /AKR/);
});
