// Flat logins use an internal email address so residents can log in with just their flat number.
// First society (Aakar): a101@flats.aakarsociety.app. Any other society: a101@<society word>.flats.aakarsociety.app (lib/societyWord.ts).
import { residentDomain, wordFromDomain } from "./societyWord";
export const RESIDENT_DOMAIN = "flats.aakarsociety.app";
/** How flat numbers become logins. Needed before anyone is logged in, so it lives in code (one setting per society's own copy of the app). */
export type FlatRules = {
  /** Towers whose positions 01 + 02 of every floor are ONE joined home under the 01 number (B202 -> B201). Aakar: the B building. */
  joinedLetters: string[];
  /** Flats in those towers that are NOT joined (each has its own login). */
  separate: string[];
};
export const AAKAR_RULES: FlatRules = { joinedLetters: ["B"], separate: ["B101", "B102"] };
/** The rules this copy of the app uses. Aakar's copy keeps Aakar's. A society with no joined homes sets `joinedLetters: []`. */
export const FLAT_RULES: FlatRules = AAKAR_RULES;
/** Positions 1 and 2 of the B building that are separate flats, not one joined home. */
export const SEPARATE_FLATS = AAKAR_RULES.separate;
/** "A-101", "a101", "A 101" -> "A101" (or null if it isn't a flat number) */
export function normaliseFlat(input: string, rules: FlatRules = FLAT_RULES): string | null {
  const m = input.trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{2,5})(?:\s*\/\s*\d{2,5})?$/);
  if (!m) return null;
  // Joined towers (Aakar: B): positions 1 + 2 of every floor are one 4 BHK home under the first number (B202 -> B201, "B-201/202" -> B201).
  // Exception (30 Oct 2026): B101 and B102 are two separate flats, each with its own login.
  if (rules.joinedLetters.includes(m[1])) {
    const id = `${m[1]}${m[2]}`;
    if (m[2].endsWith("02") && !rules.separate.includes(id)) return `${m[1]}${m[2].slice(0, -2)}01`;
    if (rules.separate.includes(id) && input.includes("/")) return null; // "B-101/102" is no longer one flat
  }
  return `${m[1]}${m[2]}`;
}
export const flatEmail = (flatId: string, word?: string | null) => `${flatId.toLowerCase()}@${residentDomain(RESIDENT_DOMAIN, word)}`;
/** Tenant login of a rented flat (30 Oct 2026): logs in with the flat number + T, e.g. "A-101-T". */
export const tenantEmail = (flatId: string, word?: string | null) => `${flatId.toLowerCase()}.tenant@${residentDomain(RESIDENT_DOMAIN, word)}`;
/** What was typed on the login screen: a flat ("A-101"), a tenant ("A-101-T", "A101T", "A 101 tenant") or null. */
export function parseLogin(input: string): { flat: string; tenant: boolean } | null {
  const s = input.trim();
  const t = s.match(/^(.*?)[\s-]*(t|tenant)$/i);
  if (t && /\d$/.test(t[1].trim())) { const flat = normaliseFlat(t[1]); return flat ? { flat, tenant: true } : null; }
  const flat = normaliseFlat(s);
  return flat ? { flat, tenant: false } : null;
}
/** Is this the internal address of a flat or tenant login (of any society)? */
export function isFlatEmail(email?: string | null): boolean {
  const e = String(email || "").toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const d = e.slice(at + 1);
  return d === RESIDENT_DOMAIN || wordFromDomain(d, RESIDENT_DOMAIN) !== null;
}
