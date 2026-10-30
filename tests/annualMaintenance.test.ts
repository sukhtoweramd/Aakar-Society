// Annual maintenance, half-yearly bills, rented flats at 1.5× (decided 30 Oct 2026). Sample amounts only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { maintenanceCharge, rentMultiplier } from "../lib/billing";

test("half-year bill = annual ÷ 2", () => {
  const c = maintenanceCharge(24000, 6, false);
  assert.equal(c.amount, 12000);
  assert.equal(c.lines.length, 1);
});

test("rented flat pays 1.5 × standard, as a separate line, bill total ₹18,000", () => {
  const c = maintenanceCharge(24000, 6, true, 1.5);
  assert.equal(c.amount, 18000);
  assert.deepEqual(c.lines.map((l) => l.amount), [12000, 6000]);
});

test("no rate set = nothing to bill; other periods are a share of the year; rupees rounded", () => {
  assert.equal(maintenanceCharge(null, 6, false).amount, 0);
  assert.equal(maintenanceCharge(0, 6, true).amount, 0);
  assert.equal(maintenanceCharge(24000, 12, false).amount, 24000);
  assert.equal(maintenanceCharge(5555, 6, false).amount, 2778);
  assert.equal(maintenanceCharge(5555, 6, true, 1.5).amount, 2778 + 1389);
});

test("multiplier setting: 1.5 by default, only 1–5 accepted", () => {
  assert.equal(rentMultiplier(null), 1.5);
  assert.equal(rentMultiplier({ rent_multiplier: 2 }), 2);
  assert.equal(rentMultiplier({ rent_multiplier: 0 }), 1.5);
  assert.equal(rentMultiplier({ rent_multiplier: 9 }), 1.5);
  assert.equal(maintenanceCharge(24000, 6, true, 1).lines.length, 1);   // multiplier 1 = no extra line
});
