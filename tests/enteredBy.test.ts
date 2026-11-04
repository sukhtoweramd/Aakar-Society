// PR-16: "Entered by" on complaints and bookings, read from the email the database recorded (sample addresses only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enteredByLabel } from "../lib/enteredBy";
import { groupRows, type BookingRow } from "../lib/bookings";

test("flat, tenant and committee logins are told apart", () => {
  assert.equal(enteredByLabel("a502@flats.aakarsociety.app", true), "Flat login A-502");
  assert.equal(enteredByLabel("b1004@flats.aakarsociety.app", false), "Flat login B-1004");
  assert.equal(enteredByLabel("a502.tenant@flats.aakarsociety.app", true), "Tenant login A-502");
  assert.equal(enteredByLabel("member@example.com", true, { "member@example.com": "Sample Member" }), "Committee: Sample Member (member@example.com)");
  assert.equal(enteredByLabel("Member@Example.com", true), "Committee: Member@Example.com");
});

test("members never see a committee member's email", () => {
  assert.equal(enteredByLabel("member@example.com", false, { "member@example.com": "Sample Member" }), "Committee");
});

test("old or missing entries are shown as not recorded, never guessed", () => {
  for (const v of [null, undefined, "", "  ", "unknown", "UNKNOWN"]) assert.equal(enteredByLabel(v as any, true), "Not recorded");
});

test("a booking keeps who entered it when its rows are grouped", () => {
  const r = (o: Partial<BookingRow>): BookingRow => ({ id: "1", group_id: "g", flat_id: "A502", area_id: "x", area_name: "TOWER-A", book_date: "2026-12-01", slot: "day", purpose: null,
    status: "pending", reason: null, decided_by: null, decided_at: null, notice_id: null, created_by: "member@example.com", created_at: "2026-11-04T00:00:00Z", ...o });
  const g = groupRows([r({}), r({ id: "2", area_name: "CENTER" })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].created_by, "member@example.com");
});

test("both cards show the line, and the committee names are loaded only for committee viewers", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
  assert.match(read("app/ledger/ComplaintsPanel.tsx"), /Entered by: \{enteredByLabel\(c\.created_by, isCommittee, names\)\}/);
  assert.match(read("app/ledger/BookingPanel.tsx"), /Entered by: \{enteredByLabel\(g\.created_by, isCommittee, names\)\}/);
  assert.match(read("app/ledger/useCommitteeNames.ts"), /if \(!isCommittee\) return;/);
});
