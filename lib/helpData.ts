// HELP assistant: the member's OWN dues as a short text block, so the assistant can answer "how much do I owe?".
// Pure logic with no Supabase import (tests load it directly). The rows come from the member's own login, so the
// database rules already limit them to that flat; nothing here widens access.
import { flatTotals } from "./billTotals";
import { docChecklist, docTypeOf } from "./flatDocTypes";

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

/** True when a committee member asks about the whole society's dues (which flats owe, how much is outstanding). */
export function wantsSocietyDues(question: string): boolean {
  const q = String(question || "").toLowerCase();
  const money = /\b(due|dues|owe|owes|owed|outstanding|pending|overdue|unpaid|defaulter|defaulters|arrears|not paid|haven't paid|have not paid)\b/.test(q) || /(બાકી|बकाया|बाकी)/.test(q);
  const society = /\b(flats?|members?|residents?|owners?|society|total|all|which|who|how many|list|top)\b/.test(q) || /(ફ્લેટ|फ्लैट)/.test(q);
  return money && society;
}

type SocBill = BillRow & { flat_id: string };
type SocPay = PayRow & { flat_id: string };

/**
 * A short summary for the committee: total outstanding, how many flats owe, and the flats owing most.
 * Flat ids and, when given, the owner's name (the committee sees the same in BILLING). No phone numbers or bank balances.
 * Cancelled documents and tenant booking bills are left out.
 */
export function societyDuesFacts(bills: SocBill[], pays: SocPay[], today: string, top = 15, names: Record<string, string> = {}): string {
  const byFlat = new Map<string, { bills: SocBill[]; pays: SocPay[] }>();
  for (const b of bills) { if (!byFlat.has(b.flat_id)) byFlat.set(b.flat_id, { bills: [], pays: [] }); byFlat.get(b.flat_id)!.bills.push(b); }
  for (const p of pays) { if (byFlat.has(p.flat_id)) byFlat.get(p.flat_id)!.pays.push(p); }
  const rows: { flat: string; due: number; oldest: string | null; pastDue: boolean }[] = [];
  let totalDue = 0, billed = 0;
  for (const [flat, x] of Array.from(byFlat.entries())) {
    const t = flatTotals(x.bills as any, x.pays as any);
    billed += t.billed;
    if (t.due > 0.001) {
      const live = x.bills.filter((b) => b.status === "active" && !b.tenant_bill);
      const paidOn = (id: string) => x.pays.filter((p) => p.status === "active" && p.bill_id === id).reduce((n, p) => n + num(p.amount), 0);
      const openDates = live.filter((b) => num(b.amount) - paidOn(b.id) > 0.001).map((b) => b.due_date || b.bill_date).sort();
      rows.push({ flat, due: t.due, oldest: openDates[0] || null, pastDue: !!openDates[0] && openDates[0] < today });
      totalDue += t.due;
    }
  }
  if (!byFlat.size || billed === 0) return "No bills have been raised yet.";
  if (!rows.length) return `All ${byFlat.size} flats with bills are fully paid. Nothing is outstanding.`;
  rows.sort((a, z) => z.due - a.due);
  const past = rows.filter((r) => r.pastDue).length;
  const lines = [`Outstanding in total ${money(Math.round(totalDue * 100) / 100)} across ${rows.length} of ${byFlat.size} flats that have bills; ${past} of them have a bill past its due date.`];
  lines.push(`Largest dues (up to ${top}):`);
  for (const r of rows.slice(0, top)) lines.push(`- Flat ${r.flat}${names[r.flat] ? ` (${names[r.flat]})` : ""}: ${money(r.due)}${r.oldest ? `, oldest open bill due ${r.oldest}${r.pastDue ? " (past due)" : ""}` : ""}`);
  if (rows.length > top) lines.push(`(${rows.length - top} more flats owe smaller amounts; use the dues list in BILLING for the full list.)`);
  return lines.join("\n");
}

// ---------- a member's or tenant's OWN complaints, bookings and letter requests ----------
export type RecordTopic = "complaints" | "bookings" | "letters";

/** Which of the member's own records a question is about (empty = none, so nothing is looked up). */
export function wantsOwnRecords(question: string): RecordTopic[] {
  const q = String(question || "").toLowerCase();
  const out: RecordTopic[] = [];
  if (/\b(complaint|complaints|complain|my issue|raised|lift|leak|leakage|repair)\b/.test(q) || /(ફરિયાદ|शिकायत)/.test(q)) out.push("complaints");
  if (/\b(booking|bookings|booked|book|reserve|reserved|plot|hall|slot|party)\b/.test(q) || /(બુકિંગ|बुकिंग)/.test(q)) out.push("bookings");
  if (/\b(letter|letters|noc|certificate|no dues|address proof)\b/.test(q) || /(પત્ર|पत्र)/.test(q)) out.push("letters");
  return out;
}

const cut = (s: any, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

type Cmp = { complaint_no: string | null; flat_id: string; assigned_flat: string | null; backup_flat: string | null; area_name: string | null; description: string; status: string; progress_note: string | null; close_note: string | null; created_at: string };
type Bkg = { group_id: string; area_name: string; book_date: string; slot: string; purpose: string | null; status: string; reason: string | null };
type Ltr = { letter_type: string; status: string; reason: string | null; created_at: string };

/** A short block about the flat's own records. Newest first, at most 5 of each kind. */
export function recordsFacts(flat: string, topics: RecordTopic[], d: { complaints?: Cmp[]; bookings?: Bkg[]; letters?: Ltr[] }): string {
  const out: string[] = [];
  if (topics.includes("complaints")) {
    const rows = [...(d.complaints || [])].sort((a, z) => z.created_at.localeCompare(a.created_at)).slice(0, 5);
    out.push(rows.length ? "Complaints (newest first):" : "No complaints found for this flat.");
    for (const c of rows) {
      const role = c.flat_id === flat ? "raised by this flat" : "assigned to this flat to handle";
      const note = c.close_note || c.progress_note;
      out.push(`- ${c.complaint_no || "no number"}${c.area_name ? `, ${c.area_name}` : ""}: ${cut(c.description, 90)} Status ${c.status.replace("_", " ")} (${role}, ${c.created_at.slice(0, 10)})${note ? `. Note: ${cut(note, 100)}` : ""}`);
    }
  }
  if (topics.includes("bookings")) {
    const groups = new Map<string, Bkg[]>();
    for (const b of d.bookings || []) groups.set(b.group_id, [...(groups.get(b.group_id) || []), b]);
    const rows = Array.from(groups.values()).sort((a, z) => z[0].book_date.localeCompare(a[0].book_date)).slice(0, 5);
    out.push(rows.length ? "Common plot bookings (latest dates first):" : "No bookings found for this flat.");
    for (const g of rows) {
      const b = g[0];
      out.push(`- ${b.book_date}, ${b.slot}: ${g.map((x) => x.area_name).join(", ")}${b.purpose ? ` (${cut(b.purpose, 50)})` : ""}. Status ${b.status}${b.reason ? `. Reason: ${cut(b.reason, 100)}` : ""}`);
    }
  }
  if (topics.includes("letters")) {
    const rows = [...(d.letters || [])].sort((a, z) => z.created_at.localeCompare(a.created_at)).slice(0, 5);
    out.push(rows.length ? "Letter requests (newest first):" : "No letter requests found for this flat.");
    for (const l of rows) out.push(`- ${l.letter_type}: ${l.status}${l.reason ? `. Reason: ${cut(l.reason, 100)}` : ""} (${l.created_at.slice(0, 10)})`);
  }
  return out.join("\n");
}

// ---------- the flat's documents still to upload ----------
/** True when the question is about which documents the flat has uploaded or still has to give the society. */
export function wantsOwnDocs(question: string): boolean {
  const q = String(question || "").toLowerCase();
  return (/\b(document|documents|docs|checklist)\b/.test(q) && /\b(pending|missing|upload|uploaded|submit|submitted|still|need|needed|required|left|remaining|have)\b/.test(q))
    || /(દસ્તાવેજ|दस्तावेज)/.test(q);
}

/** The flat's document checklist: what is uploaded and what is still to upload (same list as MY FLAT → FLAT DOCUMENTS). */
export function docsFacts(storedTypes: (string | null | undefined)[], rented: boolean): string {
  const list = docChecklist(storedTypes, rented);
  const todo = list.filter((d) => !d.uploaded).map((d) => d.name);
  const done = list.filter((d) => d.uploaded).map((d) => d.name);
  const other = storedTypes.filter((s) => String(s || "").trim() && !docTypeOf(s)).length;
  const lines = [todo.length ? `Still to upload (${todo.length} of ${list.length}): ${todo.join(", ")}.` : `All ${list.length} documents on the list are uploaded.`];
  lines.push(done.length ? `Already uploaded: ${done.join(", ")}.` : "No documents from the list are uploaded yet.");
  if (!rented) lines.push("Rent agreement is needed only when the flat is rented, so it is not on this flat's list.");
  if (other > 0) lines.push(`${other} other file${other === 1 ? " is" : "s are"} uploaded outside the list.`);
  return lines.join("\n");
}
