import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { duesFacts, wantsOwnMoney } from "../lib/helpData";

const bill = (o: any) => ({ id: "b1", bill_no: "M-001", bill_date: "2026-04-01", due_date: "2026-04-30", period_from: "2026-04-01", period_to: "2026-09-30", amount: 10000, status: "active", tenant_bill: false, ...o });
const pay = (o: any) => ({ bill_id: "b1", amount: 4000, paid_on: "2026-05-02", mode: "UPI", receipt_no: "R-001", status: "active", ...o });

test("only questions about amounts look up data", () => {
  assert.ok(wantsOwnMoney("How much maintenance do I owe?"));
  assert.ok(wantsOwnMoney("what is my outstanding balance"));
  assert.ok(wantsOwnMoney("મારું બિલ કેટલું બાકી છે"));
  assert.ok(!wantsOwnMoney("How do I raise a complaint about the lift?"));
  assert.ok(!wantsOwnMoney("How do I add a vehicle"));
});
test("dues summary shows what is left and flags a past due date", () => {
  const t = duesFacts([bill({})], [pay({})], "2026-06-01");
  assert.match(t, /still due Rs 6,000/);
  assert.match(t, /Bill M-001.*Rs 6,000 left to pay.*due 2026-04-30 \(past its due date\)/);
  assert.match(t, /Latest payment received: Rs 4,000 on 2026-05-02 by UPI \(receipt R-001\)/);
});
test("cancelled bills, cancelled receipts and tenant booking bills are left out", () => {
  const t = duesFacts([bill({}), bill({ id: "b2", bill_no: "X-9", status: "cancelled" }), bill({ id: "b3", bill_no: "T-1", tenant_bill: true })], [pay({ amount: 1000, status: "cancelled" })], "2026-03-01");
  assert.match(t, /still due Rs 10,000/);
  assert.ok(!t.includes("X-9") && !t.includes("T-1") && !t.includes("Latest payment"));
});
test("a fully paid flat says nothing is due; no bills says so", () => {
  assert.match(duesFacts([bill({})], [pay({ amount: 10000 })], "2026-06-01"), /Nothing is due/);
  assert.match(duesFacts([], [], "2026-06-01"), /No bills have been raised/);
});
test("the help route gives data only to a plain flat login, through the member's own client", () => {
  const src = readFileSync("app/api/help/route.ts", "utf8");
  assert.match(src, /me\.flatId && !me\.isCommittee && !me\.isTenant && wantsOwnMoney\(question\)/);
  assert.ok(!src.includes("getAdminClient"), "the help route must not use the server key");
});
