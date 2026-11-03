import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFESSION_CATEGORIES, normalizeCategory, directoryCategory, categoryOptions } from "../lib/professions";

const list: readonly string[] = PROFESSION_CATEGORIES;

test("new options are in the list", () => {
  for (const c of ["Home Maker", "Student", "Doctor / Medical", "Legal / Lawyer", "Automobile"]) assert.ok(list.includes(c), c);
});
test("Home Business and Home Maker are separate options", () => {
  assert.ok(list.includes("Home Business") && list.includes("Home Maker"));
});
test("no option appears twice and Manufacturing is there once", () => {
  assert.equal(new Set(list).size, list.length);
  assert.equal(list.filter((c) => c === "Manufacturing").length, 1);
});
test("Other is the last option", () => {
  assert.equal(list[list.length - 1], "Other");
});
test("old saved Medical and Legal show under their new names", () => {
  assert.equal(normalizeCategory("Medical"), "Doctor / Medical");
  assert.equal(normalizeCategory(" legal "), "Legal / Lawyer");
  assert.ok(!list.includes("Medical") && !list.includes("Legal"));
});
test("other saved values keep working", () => {
  for (const c of ["Finance / CA", "IT / Software", "Home Business", "Manufacturing", "Service / Job", "Other"]) assert.equal(normalizeCategory(c), c);
  assert.equal(normalizeCategory("it / software"), "IT / Software");
  assert.equal(normalizeCategory("Textiles"), "Textiles");
  assert.equal(normalizeCategory(null), "");
  assert.equal(directoryCategory(""), "Other");
});
test("an unusual saved value stays selectable, just before Other", () => {
  const opts = categoryOptions("Textiles");
  assert.equal(opts[opts.length - 1], "Other");
  assert.equal(opts[opts.length - 2], "Textiles");
  assert.deepEqual(categoryOptions("Medical"), [...list]);
  assert.deepEqual(categoryOptions(""), [...list]);
});
