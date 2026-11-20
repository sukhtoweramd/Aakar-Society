import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { duesFacts, societyDuesFacts, wantsOwnMoney, wantsSocietyDues } from "../lib/helpData";

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

const sb = (o: any) => ({ ...bill({}), flat_id: "A101", ...o });
const sp = (o: any) => ({ ...pay({}), flat_id: "A101", ...o });

test("committee questions about the whole society's dues are recognised", () => {
  assert.ok(wantsSocietyDues("Which flats have overdue bills?"));
  assert.ok(wantsSocietyDues("how many flats have not paid maintenance"));
  assert.ok(wantsSocietyDues("total outstanding of the society"));
  assert.ok(!wantsSocietyDues("How do I add a notice?"));
  assert.ok(!wantsSocietyDues("which flats are in tower A"));
});
test("society summary lists the largest dues first and shows flat ids only", () => {
  const bills = [sb({ id: "1", bill_no: "M-1", flat_id: "A101", amount: 10000 }), sb({ id: "2", bill_no: "M-2", flat_id: "A102", amount: 20000, due_date: "2026-08-01" }), sb({ id: "3", bill_no: "M-3", flat_id: "A103", amount: 5000 })];
  const pays = [sp({ bill_id: "1", flat_id: "A101", amount: 10000 }), sp({ bill_id: "3", flat_id: "A103", amount: 1000 })];
  const t = societyDuesFacts(bills as any, pays as any, "2026-09-01");
  assert.match(t, /Outstanding in total Rs 24,000 across 2 of 3 flats/);
  assert.match(t, /2 of them have a bill past its due date/);
  assert.ok(t.indexOf("Flat A102") < t.indexOf("Flat A103"));
  assert.ok(!t.includes("Flat A101"));
});
test("owner names are shown when given", () => {
  const t = societyDuesFacts([sb({ id: "2", flat_id: "A102", amount: 20000 })] as any, [], "2026-09-01", 15, { A102: "R. Shah" });
  assert.match(t, /Flat A102 \(R\. Shah\): Rs 20,000/);
  assert.ok(!societyDuesFacts([sb({ id: "2", flat_id: "A102", amount: 20000 })] as any, [], "2026-09-01").includes("Flat A102 ("));
});
test("society summary skips cancelled and tenant bills and caps the list", () => {
  const many = Array.from({ length: 20 }, (_, i) => sb({ id: `b${i}`, bill_no: `M-${i}`, flat_id: `F${i}`, amount: 1000 + i }));
  const t = societyDuesFacts(many as any, [], "2026-09-01", 5);
  assert.match(t, /15 more flats owe smaller amounts/);
  const none = societyDuesFacts([sb({ status: "cancelled" }), sb({ id: "t", tenant_bill: true })] as any, [], "2026-09-01");
  assert.match(none, /No bills have been raised yet/);
  assert.match(societyDuesFacts([sb({})] as any, [sp({ amount: 10000 })] as any, "2026-09-01"), /Nothing is outstanding/);
});
test("the society data goes only to a committee login, in pages, through the committee's own client", () => {
  const src = readFileSync("app/api/help/route.ts", "utf8");
  assert.match(src, /me\.isCommittee && wantsSocietyDues\(question\)/);
  assert.match(src, /\.range\(from, from \+ 999\)/);
  assert.ok(!src.includes("getAdminClient"));
});
