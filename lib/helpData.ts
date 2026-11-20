// HELP assistant: the member's OWN dues as a short text block, so the assistant can answer "how much do I owe?".
// Pure logic with no Supabase import (tests load it directly). The rows come from the member's own login, so the
// database rules already limit them to that flat; nothing here widens access.
import { flatTotals } from "./billTotals";

type BillRow = { id: string; bill_no: string; bill_date: string; due_date: string | null; period_from: string | null; period_to: string | null; amount: number; status: string; tenant_bill?: boolean | null };
type PayRow = { bill_id: string; amount: number; paid_on: string; mode: string; receipt_no: string; status: string };

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (n: number) => `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** True when the question is about the member's own amounts, so the data is looked up (and sent to the AI) only then. */
export function wantsOwnMoney(question: string): boolean {
  const q = String(question || "").toLowerCase();
  // English plus the common Gujarati / Hindi words written in English letters or script
  return /\b(due|dues|owe|owed|outstanding|balance|pending|overdue|unpaid|how much|bill|bills|paid|payment|receipt|maintenance|amount)\b/.test(q)
    || /(બાકી|બિલ|ભર્યા|ચુકવણી|रसीद|बकाया|बिल|भुगतान|बाकी)/.test(q);
}

/** A short, factual block about one flat's bills and payments. Cancelled documents and tenant booking bills are left out. */
export function duesFacts(bills: BillRow[], pays: PayRow[], today: string): string {
  const live = bills.filter((b) => b.status === "active" && !b.tenant_bill);
  if (!live.length) return "No bills have been raised for this flat yet.";
  const activePays = pays.filter((p) => p.status === "active");
  const paidOn = (id: string) => activePays.filter((p) => p.bill_id === id).reduce((n, p) => n + num(p.amount), 0);
  const t = flatTotals(bills as any, pays as any);
  const open = live
    .map((b) => ({ b, left: Math.round((num(b.amount) - paidOn(b.id)) * 100) / 100 }))
    .filter((x) => x.left > 0.001)
    .sort((a, z) => (a.b.due_date || a.b.bill_date).localeCompare(z.b.due_date || z.b.bill_date))
    .slice(0, 6);
  const lines = [`Total billed ${money(t.billed)}, received ${money(t.received)}, still due ${money(t.due)}.`];
  if (!open.length) lines.push("Nothing is due.");
  for (const { b, left } of open) {
    const period = b.period_from ? ` for ${b.period_from} to ${b.period_to}` : "";
    const late = b.due_date && b.due_date < today ? " (past its due date)" : "";
    lines.push(`Bill ${b.bill_no}${period}: ${money(num(b.amount))}, ${money(left)} left to pay${b.due_date ? `, due ${b.due_date}` : ""}${late}.`);
  }
  const last = [...activePays].sort((a, z) => z.paid_on.localeCompare(a.paid_on))[0];
  if (last) lines.push(`Latest payment received: ${money(num(last.amount))} on ${last.paid_on} by ${last.mode} (receipt ${last.receipt_no}).`);
  return lines.join("\n");
}
