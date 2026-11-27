import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { cleanAnswer } from "../lib/helpAnswer";
import { pickGuide, questionTerms, scoreSection, splitGuide } from "../lib/helpSections";

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
test("questions about the assistant itself get its section, and the guide names the admin setup screens", () => {
  assert.ok(has("what can I ask the help assistant", "Asking the HELP assistant"));
  assert.ok(KB.includes("FLAT SETUP") && KB.includes("COMMON AREAS (PLOT BOOKINGS)"));
});

test("questions about setting up towers and flats get the setup section first, and its button names exist in the app", () => {
  for (const q of ["How do one setup flats", "how to create flats", "how do I add a tower", "add a new wing"]) {
    assert.ok(pickGuide(KB, q).includes("## Setup of a society: towers and flats"), q);
    const top = splitGuide(KB).map((s) => [s.title, scoreSection(s, questionTerms(q))] as const).sort((a, b) => b[1] - a[1])[0][0];
    assert.ok(top.startsWith("Setup of a society: towers and flats"), q);
  }
  // the names the guide tells people to press are really on those screens
  const gen = readFileSync("app/ledger/FlatGenerator.tsx", "utf8") + readFileSync("app/ledger/SetupEditors.tsx", "utf8") + readFileSync("app/ledger/FlatSetupPanel.tsx", "utf8");
  for (const w of ["ADD A TOWER (OR WING)", "+ ADD TOWER", "CREATE THE FLATS", "SAME ON EVERY FLOOR", "TYPE EACH FLOOR", "FLATS PER FLOOR", "+ ADD FLOOR", "MAINTENANCE / YEAR", "TERRACE FLOOR / YEAR", "PREVIEW", "REMOVE FLATS THAT HOLD NO DATA"]) {
    assert.ok(gen.includes(w) || readFileSync("app/ledger/FlatRemover.tsx", "utf8").includes(w), w);
    assert.ok(KB.includes(w.replace("ADD A TOWER (OR WING)", "ADD A TOWER (OR WING)")) || w === "PREVIEW" || w === "MAINTENANCE / YEAR" || w === "TERRACE FLOOR / YEAR", w);
  }
});

test("a NOT_FOUND reply keeps no stray full stop; a reply that still answers is shown as an answer", () => {
  assert.deepEqual(cleanAnswer("NOT_FOUND. Please contact the app coordinator for help."), { answer: "Please contact the app coordinator for help.", notFound: true });
  assert.deepEqual(cleanAnswer("NOT_FOUND\nPlease contact the app coordinator."), { answer: "Please contact the app coordinator.", notFound: true });
  assert.equal(cleanAnswer("NOT_FOUND: Contact the coordinator").notFound, true);
  // the family-member case from the live screen: it answered, but wrote NOT_FOUND first
  const mixed = cleanAnswer("NOT_FOUND. Please contact the app coordinator for help. You can add family members in MY FLAT → FAMILY MEMBERS.");
  assert.equal(mixed.notFound, false); assert.equal(mixed.answer, "You can add family members in MY FLAT → FAMILY MEMBERS.");
  assert.deepEqual(cleanAnswer("1. Open MY FLAT.\n2. Tap FAMILY MEMBERS."), { answer: "1. Open MY FLAT.\n2. Tap FAMILY MEMBERS.", notFound: false });
  assert.deepEqual(cleanAnswer("નથી મળ્યું"), { answer: "નથી મળ્યું", notFound: false });
  const route = readFileSync("app/api/help/route.ts", "utf8");
  assert.match(route, /cleanAnswer\(text\)/); assert.match(route, /NEVER write NOT_FOUND/);
});

test("questions about the logo, address and stamp reach the ADMIN / setup sections", () => {
  for (const q of ["where do i setup my logo", "can i edit the society name and address", "how do I change the stamp"]) {
    const p = pickGuide(KB, q);
    assert.ok(p.includes("## ADMIN for the committee") || p.includes("## Setup of a society"), q);
  }
});
