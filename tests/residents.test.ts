// Flat-number logins: the internal email must be built the same way everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatEmail, isFlatEmail, normaliseFlat, RESIDENT_DOMAIN } from "../lib/residents";

test("normaliseFlat accepts the usual ways of typing a flat number", () => {
  for (const s of ["A-101", "a101", "A 101", " a - 101 ", "C1004"]) assert.ok(normaliseFlat(s), s);
  assert.equal(normaliseFlat("A-101"), "A101");
  assert.equal(normaliseFlat("b 1004"), "B1004");
});

test("normaliseFlat rejects things that are not flat numbers", () => {
  for (const s of ["", "A", "101", "AB-101", "A-1", "someone@gmail.com", "A-101; drop table"]) assert.equal(normaliseFlat(s), null, s);
});

test("flat emails are recognised, other emails are not", () => {
  assert.equal(flatEmail("A101"), `a101@${RESIDENT_DOMAIN}`);
  assert.ok(isFlatEmail(flatEmail("C301")));
  assert.ok(!isFlatEmail("committee@gmail.com"));
  assert.ok(!isFlatEmail(null));
});

test("4 BHK homes of the B building log in under the first number", () => {
  assert.equal(normaliseFlat("B202"), "B201");
  assert.equal(normaliseFlat("b-1002"), "B1001");
  assert.equal(normaliseFlat("B-201/202"), "B201");
  assert.equal(normaliseFlat("B201"), "B201");
  assert.equal(normaliseFlat("B103"), "B103");
  assert.equal(normaliseFlat("A102"), "A102");   // only the B building
});

test("joined home shows as B-101/102 and sorts on its first number", async () => {
  const { label, flatNumber, floorOf } = await import("../lib/society");
  const f: any = { id: "B101", flat_no: "B101/102", tower: "C", floor: null };
  assert.equal(label(f), "B-101/102");
  assert.equal(flatNumber(f), 101);
  assert.equal(floorOf(f), 1);
  assert.equal(label({ id: "A1001" } as any), "A-1001");
});

test("B101 and B102 are separate flats with their own logins (30 Oct 2026)", () => {
  assert.equal(normaliseFlat("B101"), "B101");
  assert.equal(normaliseFlat("B-102"), "B102");
  assert.equal(normaliseFlat("b 102"), "B102");
  assert.equal(normaliseFlat("B-101/102"), null);
  assert.equal(normaliseFlat("B-302"), "B301");   // other pairs unchanged
});

// Aakar's behaviour must not change (19 Nov 2026): the rule is now a setting, so compare with the old fixed code over many inputs.
const oldNormalise = (input: string): string | null => {
  const m = input.trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{2,5})(?:\s*\/\s*\d{2,5})?$/);
  if (!m) return null;
  if (m[1] === "B" && m[2].endsWith("02") && !["B101", "B102"].includes(`B${m[2]}`)) return `B${m[2].slice(0, -2)}01`;
  if (m[1] === "B" && ["B101", "B102"].includes(`B${m[2]}`) && input.includes("/")) return null;
  return `${m[1]}${m[2]}`;
};
test("normaliseFlat gives exactly the old answer for Aakar (every tower, floors 1-12, positions 1-6, several spellings, joined forms)", () => {
  let n = 0;
  for (const L of ["A", "B", "C", "a", "b", "D"]) for (let fl = 1; fl <= 12; fl++) for (let u = 1; u <= 6; u++) {
    const num = `${fl}${String(u).padStart(2, "0")}`;
    for (const s of [`${L}${num}`, `${L}-${num}`, `${L} ${num}`, ` ${L} - ${num} `, `${L}-${num}/${fl}${String(u + 1).padStart(2, "0")}`, `${L}${num} / ${num}`]) {
      assert.equal(normaliseFlat(s), oldNormalise(s), s); n++;
    }
  }
  assert.ok(n > 2000);
});
test("a society with no joined homes: every tower keeps its own numbers (B102 stays B102)", () => {
  const none = { joinedLetters: [], separate: [] };
  assert.equal(normaliseFlat("B102", none), "B102");
  assert.equal(normaliseFlat("b-202", none), "B202");
  assert.equal(normaliseFlat("B-201/202", none), "B201");   // a typed pair keeps its first number only because the pattern reads it so
  assert.equal(normaliseFlat("A102", none), "A102");
  assert.equal(normaliseFlat("A-1", none), null);
});
test("another tower can be the joined one: a different letter and its own separate flats", () => {
  const r = { joinedLetters: ["D"], separate: ["D201"] };
  assert.equal(normaliseFlat("D302", r), "D301");
  assert.equal(normaliseFlat("D201", r), "D201");
  assert.equal(normaliseFlat("B302", r), "B302");
});
