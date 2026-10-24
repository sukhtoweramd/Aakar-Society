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
