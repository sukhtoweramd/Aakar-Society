// Fill-in fields of a letter format (RESOLUTION_FORMAT.sql, 31 Oct 2026). No database code here, so tests can load it.
// A format may use any {{field}} it likes. The ones the society's records know (owner_name, flat_no …) are filled
// automatically; every other field becomes a box for the committee to fill in when issuing:
//   • a name ending _date   → a date box, printed as 14 March 2026
//   • a name ending _amount → an amount box, printed as 12,500
//   • a name ending _words  → worked out from the matching _amount ("Twelve Thousand Five Hundred"), no box
//   • any other name        → a text box (resolution_no, transferee_name …)
import { TEMPLATE_FIELDS } from "./letterTemplates";
import { inWords } from "./words";

const KNOWN = new Set(TEMPLATE_FIELDS.map((f) => f.key));

/** Every {{field}} used in the text, once each, in the order they first appear. */
export function fieldsIn(body: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([a-z_]+)\s*\}\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(String(body || ""))) !== null) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
export type FillField = { key: string; label: string; kind: "date" | "amount" | "text" };
export const fieldKind = (key: string): FillField["kind"] => (key.endsWith("_date") ? "date" : key.endsWith("_amount") ? "amount" : "text");
export const fieldLabel = (key: string) => { const t = key.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
/** The boxes to show: fields the records do not know and that are not worked out from another field. */
export function fillFields(body: string): FillField[] {
  return fieldsIn(body).filter((k) => !KNOWN.has(k) && !k.endsWith("_words")).map((k) => ({ key: k, label: fieldLabel(k), kind: fieldKind(k) }));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** 2026-03-14 -> "14 March 2026" */
export function longDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}
/** 12500 -> "12,500" (Indian grouping); "" when it is not a positive number */
export function amountText(v: string): string {
  const n = Number(String(v || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "";
}
/** "Twelve Thousand Five Hundred" (no "Rupees" / "Only": the format has its own words around it) */
export function wordsOf(v: string): string {
  const n = Number(String(v || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? inWords(n).replace(/^Rupees\s+/, "").replace(/\s+Only$/i, "") : "";
}

/** Values to hand to fillTemplate for the typed boxes (and the _words worked out from them). Empty stays empty -> "______". */
export function customData(body: string, typed: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of fieldsIn(body)) {
    if (KNOWN.has(k)) continue;
    if (k.endsWith("_words")) { out[k] = wordsOf(typed[k.replace(/_words$/, "_amount")] || ""); continue; }
    const v = (typed[k] || "").trim();
    out[k] = fieldKind(k) === "date" ? longDate(v) : fieldKind(k) === "amount" ? amountText(v) : v;
  }
  return out;
}
