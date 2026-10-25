// Nominee checks. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aadhaarLast4, ageOn, cleanPan, isMinor, maskedAadhaar, nomineeProblems, panOk, shareTotal } from "../lib/nominees";

const d = { name: "Sample Son", relation: "Son", dob: "2001-05-01", aadhaar: "1234", pan: "abcde1234f", share_pct: "100", mobile: "", address: "", guardian_name: "", guardian_relation: "" };

test("Aadhaar: only the last 4 digits are ever kept", () => {
  assert.equal(aadhaarLast4("1234 5678 9012"), "9012");
  assert.equal(aadhaarLast4("9012"), "9012");
  assert.equal(aadhaarLast4("12"), "");
  assert.equal(maskedAadhaar("9012"), "XXXX XXXX 9012");
});

test("PAN, age and minors", () => {
  assert.equal(cleanPan("abcde 1234f"), "ABCDE1234F");
  assert.ok(panOk("ABCDE1234F") && panOk("") && !panOk("ABC123"));
  assert.equal(ageOn("2008-10-26", new Date("2026-10-25")), 17);
  assert.equal(ageOn("2008-10-25", new Date("2026-10-25")), 18);
  assert.equal(isMinor("2012-01-01", new Date("2026-10-25")), true);
});

test("form checks", () => {
  assert.deepEqual(nomineeProblems(d), []);
  assert.ok(nomineeProblems({ ...d, dob: "2015-01-01" }).some((p) => /Guardian/.test(p)));
  assert.ok(nomineeProblems({ ...d, aadhaar: "12345" }).length === 1);
  assert.deepEqual(nomineeProblems({ ...d, aadhaar: "1234 5678 9012" }), []);
  assert.ok(nomineeProblems({ ...d, share_pct: "0" }).length === 1);
  assert.equal(shareTotal([{ share_pct: 33.33 }, { share_pct: "33.33" }, { share_pct: 33.34 }]), 100);
});
