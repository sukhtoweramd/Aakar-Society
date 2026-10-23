"use client";
// Event committees (Navratri, SPL…): organising team and event money book.
// Event money is separate from society billing: nothing here touches bills, payments or the flat ledger.
import { supabase } from "./supabaseClient";
import { dmy, docPage, inr, today } from "./billing";
import { label, ownerText, type Flat } from "./society";

export type EventRole = "Convenor" | "Treasurer" | "Member";
export type TeamRow = { id: string; event_id: string; flat_id: string; person: string | null; role: EventRole; created_at: string };
export type Money = {
  id: string; event_id: string; entry_date: string; direction: "in" | "out"; category: string; flat_id: string | null; party: string | null; purpose: string | null;
  qty: number | null; rate: number | null; amount: number; pass_type?: "Member" | "Guest" | null; jain_qty?: number | null; mode: "Cash" | "UPI" | "Bank" | "Cheque" | "In kind"; reference: string | null; note: string | null; file_url: string | null;
  created_by: string | null; created_at: string;
};
export type EventMoneySettings = { fund_per_flat: number | null; pass_price: number | null; guest_pass_price: number | null; accounts_public: boolean };

export const IN_CATS = ["Member fund", "Sponsorship", "Passes", "Donation", "Other income"];
export const OUT_CATS = ["Food", "Prizes", "Decoration", "Sound & lights", "Venue / ground", "Artists", "Printing", "Other expense"];
export const EV_MODES: Money["mode"][] = ["Cash", "UPI", "Bank", "Cheque", "In kind"];
export const ROLE_ORDER: Record<EventRole, number> = { Convenor: 0, Treasurer: 1, Member: 2 };

const missing = (m: string) => /event_team|event_money|schema cache|does not exist/i.test(m);
/** null = not set up yet (run EVENT_COMMITTEES.sql) */
export async function loadTeams(): Promise<TeamRow[] | null> {
  const { data, error } = await supabase.from("event_team").select("*");
  if (error) return missing(error.message) ? null : [];
  return (data as TeamRow[]) || [];
}
export async function loadMoney(eventId: string): Promise<Money[]> {
  const { data, error } = await supabase.from("event_money").select("*").eq("event_id", eventId).order("entry_date").order("created_at");
  if (error) throw error;
  return (data as Money[]) || [];
}

/** Cash totals (In kind is listed but not counted in cash). */
export function totals(list: Money[]) {
  const cash = list.filter((m) => m.mode !== "In kind");
  const sum = (a: Money[]) => a.reduce((s, m) => s + Number(m.amount || 0), 0);
  const byCat = (dir: "in" | "out") => {
    const r: Record<string, number> = {};
    cash.filter((m) => m.direction === dir).forEach((m) => { r[m.category] = (r[m.category] || 0) + Number(m.amount || 0); });
    return Object.entries(r).sort((a, b) => b[1] - a[1]);
  };
  const income = sum(cash.filter((m) => m.direction === "in"));
  const spent = sum(cash.filter((m) => m.direction === "out"));
  return { income, spent, balance: income - spent, inCats: byCat("in"), outCats: byCat("out"), inKind: list.filter((m) => m.mode === "In kind") };
}

export const partyOf = (flats: Flat[], m: Pick<Money, "flat_id" | "party">) => {
  const f = flats.find((x) => x.id === m.flat_id);
  return f ? `${label(f)} • ${ownerText(f)}${m.party ? ` (${m.party})` : ""}` : m.party || "—";
};
export const particulars = (flats: Flat[], m: Money) =>
  [m.category === "Passes" && m.pass_type && !m.purpose ? `${m.pass_type} passes` : m.category, m.purpose, partyOf(flats, m) !== "—" ? partyOf(flats, m) : "", m.qty ? (m.rate != null ? `${m.qty} × ₹${inr(m.rate)}` : `${m.qty} people`) + (m.jain_qty ? ` (${m.jain_qty} Jain)` : "") : "", m.mode === "In kind" ? "in kind" : ""].filter(Boolean).join(" • ");

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const th = (t: string, right = false) => `<th style="text-align:${right ? "right" : "left"};padding:1.4mm 2mm">${t}</th>`;
const td = (t: string, right = false, extra = "") => `<td style="padding:1.3mm 2mm;${right ? "text-align:right;white-space:nowrap;" : ""}${extra}">${t}</td>`;
const H = (t: string) => `<div style="margin-top:5mm;font-size:9pt;font-weight:800;letter-spacing:.14em;color:var(--gold)">${t}</div>`;
const table = (head: string, rows: string) => `<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:1.5mm"><tr style="background:var(--navy);color:#fff">${head}</tr>${rows}</table>`;
const tr = (cells: string, bold = false) => `<tr style="border-bottom:.25mm solid var(--line)${bold ? ";font-weight:800" : ""}">${cells}</tr>`;
const signs = `<div style="margin-top:12mm;display:flex;justify-content:space-between;font-size:10pt">
  <div style="border-top:.3mm solid var(--ink);padding-top:1mm;min-width:55mm;text-align:center">Treasurer</div>
  <div style="border-top:.3mm solid var(--ink);padding-top:1mm;min-width:55mm;text-align:center">Convenor</div></div>`;
/** Split a long table over several A4 pages: headings repeat, "continued" on later pages, signatures on the last. */
export function paged(kind: string, big: string, small: string, top: string, head: string, rows: string[], firstCap: number, nextCap: number, footLeft: string, tail = "", empty = "", weights?: number[]): string[] {
  // fill pages by "row units" (a row that wraps to two lines counts as 2)
  const chunks: string[][] = [[]]; let used = 0;
  rows.forEach((r, i) => { const w = weights?.[i] || 1; const cap = chunks.length === 1 ? firstCap : nextCap;
    if (used + w > cap && chunks[chunks.length - 1].length) { chunks.push([]); used = 0; }
    chunks[chunks.length - 1].push(r); used += w; });
  // keep room for the signature lines on the last page
  const lastCap = chunks.length === 1 ? firstCap : nextCap;
  if (tail && chunks[chunks.length - 1].length > lastCap - 5) { const last = chunks[chunks.length - 1]; chunks[chunks.length - 1] = last.slice(0, Math.max(0, last.length - 4)); chunks.push(last.slice(Math.max(0, last.length - 4))); }
  const n = chunks.length;
  return chunks.map((c, i) => docPage(kind, big, small,
    (i === 0 ? top : `<div style="margin-top:5mm;font-size:9pt;opacity:.7">${esc(footLeft)} — continued (page ${i + 1} of ${n})</div>`)
      + (c.length || (i === 0 && !rows.length) ? table(head, c.join("") || empty) : "") + (i === n - 1 ? tail : ""),
    n > 1 ? `${footLeft} • page ${i + 1} of ${n}` : footLeft, `Printed ${dmy(today())}`));
}
const evDates = (e: { event_date: string | null; end_date?: string | null }) => (e.event_date ? `${dmy(e.event_date)}${e.end_date && e.end_date !== e.event_date ? ` – ${dmy(e.end_date)}` : ""}` : "");

/** Income & expenditure statement of one event, with every entry. */
export function eventStatementHtml(ev: { title: string | null; event_date: string | null; end_date?: string | null }, list: Money[], flats: Flat[], team: TeamRow[]): string[] {
  const t = totals(list);
  const who = (r: EventRole) => team.filter((x) => x.role === r).map((x) => { const f = flats.find((y) => y.id === x.flat_id); return x.person || (f ? ownerText(f) : x.flat_id); }).join(", ");
  const rowsIn = t.inCats.map(([c, a]) => tr(td(esc(c)) + td(`₹${inr(a, true)}`, true))).join("") + tr(td("Total money in") + td(`₹${inr(t.income, true)}`, true), true);
  const rowsOut = t.outCats.map(([c, a]) => tr(td(esc(c)) + td(`₹${inr(a, true)}`, true))).join("") + tr(td("Total money out") + td(`₹${inr(t.spent, true)}`, true), true);
  let run = 0;
  const cashList = list.filter((m) => m.mode !== "In kind");
  const weights = cashList.map((m) => ((particulars(flats, m) + (m.reference ? ` (${m.reference})` : "")).length > 46 ? 2 : 1));
  const detailRows = cashList.map((m) => {
    run += (m.direction === "in" ? 1 : -1) * Number(m.amount);
    return tr(td(esc(dmy(m.entry_date)), false, "white-space:nowrap") + td(esc(particulars(flats, m)) + (m.reference ? ` <span style="opacity:.6">(${esc(m.reference)})</span>` : ""))
      + td(m.direction === "in" ? inr(m.amount, true) : "", true) + td(m.direction === "out" ? inr(m.amount, true) : "", true) + td(inr(run, true), true));
  });
  const top = `
  <div style="margin-top:5mm;font-size:13pt;font-weight:800;color:var(--navy)">${esc(ev.title)}</div>
  <div style="font-size:10pt;color:#2a2822;margin-top:1mm">${esc(evDates(ev))}${who("Convenor") ? ` • Convenor: <b>${esc(who("Convenor"))}</b>` : ""}${who("Treasurer") ? ` • Treasurer: <b>${esc(who("Treasurer"))}</b>` : ""}</div>
  <div style="margin-top:2mm;font-size:8.5pt;opacity:.7">Event account, kept separately from the society's maintenance accounts.</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm">
    <div>${H("MONEY IN")}${table(th("Head") + th("Amount", true), rowsIn)}</div>
    <div>${H("MONEY OUT")}${table(th("Head") + th("Amount", true), rowsOut)}</div>
  </div>
  <div style="margin-top:4mm;border:.4mm solid var(--navy);padding:2.5mm 3mm;display:flex;justify-content:space-between;font-size:11.5pt;font-weight:800">
    <span>${t.balance >= 0 ? "BALANCE IN HAND" : "SHORTFALL"}</span><span>₹${inr(Math.abs(t.balance), true)}</span></div>
  ${t.inKind.length ? `${H("SPONSORED IN KIND (not counted above)")}${table(th("Date") + th("Sponsor") + th("For"), t.inKind.map((m) => tr(td(esc(dmy(m.entry_date))) + td(esc(partyOf(flats, m))) + td(esc([m.purpose, m.note].filter(Boolean).join(" • "))))).join(""))}` : ""}
  ${H("ALL ENTRIES")}`;
  const firstCap = Math.max(4, 14 - (t.inKind.length ? t.inKind.length + 3 : 0) - Math.max(0, Math.max(t.inCats.length, t.outCats.length) - 3));
  return paged("EVENT ACCOUNT", "STATEMENT", `As on <b>${esc(dmy(today()))}</b>`, top, th("Date") + th("Particulars") + th("In", true) + th("Out", true) + th("Balance", true),
    detailRows, firstCap, 31, `${ev.title || "Event"} • income and expenditure`, signs, tr(td("No entries", false, "opacity:.6") + td("") + td("") + td("") + td("")), weights);
}

/** Member fund: which flats have paid (all occupied flats listed). */
export function fundListHtml(ev: { title: string | null }, list: Money[], flats: Flat[], perFlat: number | null): string[] {
  const paid: Record<string, number> = {};
  list.filter((m) => m.category === "Member fund" && m.flat_id).forEach((m) => { paid[m.flat_id!] = (paid[m.flat_id!] || 0) + Number(m.amount); });
  const rows = flats.map((f, i) => tr(td(String(i + 1)) + td(esc(label(f))) + td(esc(ownerText(f))) + td(paid[f.id] ? `₹${inr(paid[f.id])}` : "—", true) + td(paid[f.id] ? "Paid" : "", false, "color:#067647;font-weight:700")));
  const n = Object.keys(paid).length, total = Object.values(paid).reduce((s, a) => s + a, 0);
  const top = `<div style="margin-top:5mm;font-size:13pt;font-weight:800;color:var(--navy)">${esc(ev.title)} – Member fund</div>
  <div style="font-size:10pt;margin-top:1mm">${perFlat ? `Contribution ₹${inr(perFlat)} per flat • ` : ""}Paid by <b>${n}</b> of ${flats.length} flats • Collected <b>₹${inr(total)}</b></div>`;
  return paged("EVENT FUND", "MEMBERS", `As on <b>${esc(dmy(today()))}</b>`, top, th("#") + th("Flat") + th("Name") + th("Paid", true) + th(""), rows, 28, 33, `${ev.title || "Event"} • member fund`);
}

/** Food count from passes: Jain as entered, the rest normal. */
export const food = (passes: Pick<Money, "qty" | "jain_qty">[]) => {
  const total = passes.reduce((s, m) => s + Number(m.qty || 1), 0), jain = passes.reduce((s, m) => s + Number(m.jain_qty || 0), 0);
  return { normal: total - jain, jain };
};
/** Pass holders, for the gate. */
export function passListHtml(ev: { title: string | null }, list: Money[], flats: Flat[]): string[] {
  const p = list.filter((m) => m.category === "Passes");
  const rows = p.map((m, i) => tr(td(String(i + 1)) + td(esc(partyOf(flats, m))) + td(esc(m.pass_type || m.purpose || "")) + td(String(m.qty || 1), true) + td(String(Number(m.qty || 1) - Number(m.jain_qty || 0)), true) + td(m.jain_qty ? String(m.jain_qty) : "—", true) + td("")));
  const n = p.reduce((s, m) => s + Number(m.qty || 1), 0);
  const nOf = (t: string) => p.filter((m) => m.pass_type === t).reduce((s, m) => s + Number(m.qty || 1), 0);
  const f = food(p);
  const top = `<div style="margin-top:5mm;font-size:13pt;font-weight:800;color:var(--navy)">${esc(ev.title)} – Pass holders</div>
  <div style="font-size:10pt;margin-top:1mm"><b>${n}</b> passes (${nOf("Member")} member, ${nOf("Guest")} guest) issued to ${p.length} buyer${p.length === 1 ? "" : "s"}</div>
  <div style="margin-top:2mm;border:.4mm solid var(--navy);padding:2mm 3mm;font-size:11pt;font-weight:800;display:flex;gap:10mm">FOOD <span>Normal: ${f.normal}</span><span>Jain: ${f.jain}</span><span>Total: ${f.normal + f.jain}</span></div>`;
  return paged("EVENT PASSES", "GATE LIST", `As on <b>${esc(dmy(today()))}</b>`, top, th("#") + th("Name / flat") + th("Pass") + th("Qty", true) + th("Normal", true) + th("Jain", true) + th("Entry ✓"),
    rows, 26, 33, `${ev.title || "Event"} • pass holders`, "", tr(td("No passes yet") + td("") + td("") + td("") + td("") + td("") + td("")));
}
