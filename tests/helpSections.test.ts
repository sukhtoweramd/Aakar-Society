import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { pickGuide, splitGuide } from "../lib/helpSections";

const KB = readFileSync("content/help-kb.md", "utf8");
const has = (q: string, heading: string) => pickGuide(KB, q).includes(`## ${heading}`);

test("guide splits at its headings", () => {
  assert.ok(splitGuide(KB).length > 10);
});
test("booking questions get the common plot section", () => {
  assert.ok(has("How do I book the common area", "Booking the common plot"));
  assert.ok(has("can I reserve the plot for a party", "Booking the common plot"));
});
test("complaint questions get the complaints section", () => {
  assert.ok(has("How do I raise a complaint", "Complaints"));
  assert.ok(has("lift is not working", "Complaints"));
});
test("letter and payment questions get their sections", () => {
  assert.ok(has("How do I ask for letter", "Letters from the society (requests)"));
  assert.ok(has("I have paid maintenance, what now", "Bills, receipts and paying maintenance"));
});
test("overview is always kept and the text stays short", () => {
  const g = pickGuide(KB, "How do I book the common area");
  assert.ok(g.includes("## Finding your way"));
  assert.ok(g.length <= 12000 && g.length < KB.length);
});
test("no match falls back to the guide", () => {
  assert.ok(pickGuide(KB, "zzzz qqqq").length > 1000);
});
