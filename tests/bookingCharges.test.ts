// Booking charges (BOOKING_CHARGES.sql, 31 Oct 2026): helpers and the rules written in the SQL. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chargeOf, groupRows, invoiceText, isApproverRole, rupees, slotName, sortAreas, totalFor, type BookingRow } from "../lib/bookings";
import { flatTotals, tenantBookingDue } from "../lib/billTotals";
import type { Bill, Payment } from "../lib/billing";

const sql = readFileSync("BOOKING_CHARGES.sql", "utf8");
const row = (o: Partial<BookingRow>): BookingRow => ({ id: "r", group_id: "g1", flat_id: "A503", area_id: "a1", area_name: "Tower A area", book_date: "2026-11-20", slot: "day", purpose: null,
  status: "approved", reason: null, decided_by: null, decided_at: null, notice_id: null, created_by: null, created_at: "2026-10-31T00:00:00Z", charge: 500, ...o });

test("areas in the agreed order and totals", () => {
  const a = sortAreas([{ id: "4", name: "Main common area", sort: 4, charge: 1000 }, { id: "1", name: "Tower A area", sort: 1, charge: 500 }, { id: "2", name: "Center area", sort: 2, charge: 0 }, { id: "3", name: "Tower B area", sort: 3, charge: 500 }]);
  assert.deepEqual(a.map((x) => x.name), ["Tower A area", "Center area", "Tower B area", "Main common area"]);
  assert.equal(totalFor(a, ["1", "4"]), 1500);
  assert.equal(totalFor(a, ["1", "4"], true), 0);           // society event
  assert.equal(totalFor(a, []), 0);
});

test("a card carries the charge each area had when booked", () => {
  const g = groupRows([row({ id: "1", charge: 500 }), row({ id: "2", area_name: "Main common area", charge: 1000 })])[0];
  assert.equal(g.total, 1500);
  assert.equal(groupRows([row({ free_event: true, charge: 800 })])[0].total, 0);
  assert.equal(chargeOf({ charge: undefined, free_event: false }), 0);
});

test("wording", () => {
  assert.equal(slotName("day"), "Full day");
  assert.equal(slotName("evening"), "Evening");
  assert.equal(rupees(1500), "₹1,500");
  assert.match(invoiceText({ areas: ["Tower A area"], book_date: "2026-11-20", total: 500 }, "AKR/O/0007"), /Invoice AKR\/O\/0007: ₹500/);
  assert.equal(isApproverRole(" Chairman "), true);
  assert.equal(isApproverRole("Vice Chairman"), false);
  assert.equal(isApproverRole("Joint Secretary"), false);
});

const bill = (o: Partial<Bill>): Bill => ({ id: "b", bill_no: "1", flat_id: "B202", kind: "other", bill_to: "Tenant", bill_date: "2026-11-01", due_date: null, period_from: null, period_to: null,
  lines: [], amount: 500, signer_id: null, signer_name: null, signer_designation: null, status: "active", cancel_reason: null, created_at: "", created_by: null, ...o });
const pay = (o: Partial<Payment>): Payment => ({ id: "p", receipt_no: "r", bill_id: "b", flat_id: "B202", amount: 200, paid_on: "2026-11-02", mode: "UPI", bank: null, ref: null, received_from: null,
  signer_id: null, signer_name: null, signer_designation: null, status: "active", cancel_reason: null, created_at: "", created_by: null, ...o } as Payment);

test("a tenant's booking invoice is not in the owner's balance", () => {
  const bills = [bill({ id: "o1", amount: 3000 }), bill({ id: "t1", amount: 500, tenant_bill: true })];
  const pays = [pay({ bill_id: "t1", amount: 200 })];
  assert.equal(flatTotals(bills, pays).due, 3000);
  assert.equal(tenantBookingDue(bills, pays), 300);
});

test("SQL: one approval = one invoice, society events and Rs 0 make none", () => {
  const decide = sql.slice(sql.indexOf("function public.decide_booking"), sql.indexOf("function public.cancel_booking"));
  assert.match(decide, /for update/);                                   // two approvals at once cannot both pass
  assert.match(decide, /where group_id = p_group and status = 'pending' limit 1 for update/);
  assert.match(decide, /if total > 0 then/);                           // no invoice for Rs 0
  assert.match(decide, /not free_event and charge > 0/);               // society events are left out
  assert.equal((decide.match(/insert into public\.bills/g) || []).length, 1);
  assert.match(decide, /tenant_bill/);
  assert.match(decide, /bill_id = bid/);                               // invoice linked to the booking
});

test("SQL: tenant sees only booking invoices, owner never sees them", () => {
  assert.match(sql, /policy resident_own on public\.bills[^;]*not tenant_bill/);
  assert.match(sql, /policy tenant_own on public\.bills[^;]*my_tenant_flat\(\) and tenant_bill/);
  assert.match(sql, /policy tenant_own on public\.payments[^;]*bill_is_tenant/);
  assert.match(sql, /policy tenant_add on public\.payment_reports[\s\S]*?b\.tenant_bill/);
  assert.match(sql, /policy resident_add on public\.payment_reports[\s\S]*?not b\.tenant_bill/);
});

test("SQL: charges only by Chairman / Secretary / main admin, with a log and a guard on direct edits", () => {
  assert.match(sql, /can_set_booking_charge\(\) returns boolean[\s\S]*?can_approve_booking\(\) or public\.is_main_admin\(\)/);
  assert.match(sql, /insert into public\.access_log[\s\S]*?booking_charge_set/);
  assert.match(sql, /create trigger booking_areas_charge_guard before update on public\.booking_areas/);
  assert.match(sql, /create trigger bookings_charge_guard before update on public\.bookings/);
});

test("SQL: full day only, four areas, cancel cancels the invoice", () => {
  assert.match(sql, /'Center area'/);
  assert.match(sql, /bookings_day_taken on public\.bookings \(area_id, book_date\) where status in \('pending', 'approved'\) and slot = 'day'/);
  assert.match(sql, /values \(g, p_flat, a\.id, a\.name, p_date, 'day'/);
  const cancel = sql.slice(sql.indexOf("function public.cancel_booking"));
  assert.match(cancel, /update public\.bills set status = 'cancelled'/);
  assert.match(cancel, /already paid/);
});

test("SQL: re-runnable and ends with a check; undo exists", () => {
  assert.match(sql, /select 'areas' as item/);
  assert.match(readFileSync("BOOKING_CHARGES_UNDO.sql", "utf8"), /drop trigger if exists bookings_charge_guard/);
  assert.doesNotMatch(sql, /^\s*drop table/im);
});
