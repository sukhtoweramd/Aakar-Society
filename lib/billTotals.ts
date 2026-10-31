// Totals of a flat's bills, kept apart from lib/billing.ts (which needs the Supabase client) so tests can import them.
import type { Bill, Payment } from "./billing";
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function flatTotals(bills: Bill[], pays: Payment[]) {
  const live = bills.filter((b) => b.status === "active" && !b.tenant_bill);
  const billed = live.reduce((n, b) => n + num(b.amount), 0);
  const received = pays.filter((p) => p.status === "active" && live.some((b) => b.id === p.bill_id)).reduce((n, p) => n + num(p.amount), 0);
  return { billed, received, due: Math.round((billed - received) * 100) / 100 };
}

/** What a tenant owes for common plot bookings (kept apart from the owner's balance). */
export function tenantBookingDue(bills: Bill[], pays: Payment[]) {
  const live = bills.filter((b) => b.status === "active" && b.tenant_bill);
  const billed = live.reduce((n, b) => n + num(b.amount), 0);
  const received = pays.filter((p) => p.status === "active" && live.some((b) => b.id === p.bill_id)).reduce((n, p) => n + num(p.amount), 0);
  return Math.round((billed - received) * 100) / 100;
}
