import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { noPending, pendingTotals } from "../lib/pendingTotals";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("main-page red numbers add up what waits for the committee", () => {
  assert.deepEqual(pendingTotals(noPending), { committee: 0, billing: 0 });
  assert.deepEqual(pendingTotals({ complaints: 2, bookings: 1, amc: 1, minutes: 3, letters: 4, payments: 5, unassigned: 9 }), { committee: 11, billing: 5 });
  assert.deepEqual(pendingTotals(null), { committee: 0, billing: 0 });
  assert.deepEqual(pendingTotals({ complaints: -3, letters: NaN as any, bookings: 2.9 }), { committee: 2, billing: 0 });
});

test("letters live in the committee tab, not in billing", () => {
  const c = read("app/ledger/CommitteeTab.tsx"), b = read("app/ledger/billing/BillingTab.tsx");
  assert.match(c, /VIEWS = \["COMPLAINTS", "BOOKINGS", "LETTERS"/);
  assert.match(c, /<LettersRegister/);
  assert.doesNotMatch(b, /LettersRegister|"LETTERS"/);
});

test("main page and phone home show the numbers for committee logins only", () => {
  const p = read("app/page.tsx"), h = read("app/ledger/PhoneHome.tsx");
  assert.match(p, /usePending\(isCommittee,/);
  assert.match(p, /isCommittee && pendingFor\(m\) > 0/);
  assert.match(p, /badges=\{\{ COMMITTEE: pend\.committee, BILLING: pend\.billing \}\}/);
  assert.match(h, /badges\?\.\[t\.key\]/);
  assert.match(read("app/ledger/usePending.ts"), /if \(!on\) return;/);   // nothing is read for members
});
