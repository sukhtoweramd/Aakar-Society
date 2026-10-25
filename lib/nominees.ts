// Nominees (item 22). Plain checks shared by the screens and the tests; database calls are in the panel.
// Only the last 4 digits of Aadhaar are kept; the full number goes on the signed paper form.

export type Nominee = {
  id: string; flat_id: string; name: string; relation: string; dob: string; aadhaar_last4: string | null; pan: string | null;
  share_pct: number; mobile: string | null; address: string | null; guardian_name: string | null; guardian_relation: string | null;
  sort: number; updated_by: string | null; updated_at: string;
};
export type NominationStatus = { flat_id: string; member_name: string | null; declared_at: string | null; declared_by: string | null; form_received: boolean; received_at: string | null; received_by: string | null };

export const RELATIONS = ["Wife", "Husband", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Grandson", "Granddaughter", "Daughter-in-law", "Son-in-law", "Other"];

/** Age in whole years on a date (default today). */
export function ageOn(dob: string, on = new Date()): number {
  const d = new Date(dob + "T00:00:00");
  let a = on.getFullYear() - d.getFullYear();
  if (on.getMonth() < d.getMonth() || (on.getMonth() === d.getMonth() && on.getDate() < d.getDate())) a--;
  return a;
}
export const isMinor = (dob: string, on?: Date) => !!dob && ageOn(dob, on) < 18;

/** What the member typed in the Aadhaar box → last 4 digits, or "" (never keeps more). */
export function aadhaarLast4(typed: string): string {
  const digits = String(typed || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}
export const cleanPan = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const panOk = (s: string) => !s || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s);

export type Draft = { name: string; relation: string; dob: string; aadhaar: string; pan: string; share_pct: string; mobile: string; address: string; guardian_name: string; guardian_relation: string };

/** Problems that stop saving one nominee; empty = fine. */
export function nomineeProblems(d: Draft): string[] {
  const p: string[] = [];
  if (d.name.trim().length < 2) p.push("Nominee's full name");
  if (!d.relation.trim()) p.push("Relation");
  if (!d.dob) p.push("Date of birth");
  else if (new Date(d.dob) > new Date()) p.push("Date of birth is in the future");
  const digits = d.aadhaar.replace(/\D/g, "");
  if (digits && digits.length !== 4 && digits.length !== 12) p.push("Aadhaar: last 4 digits");
  if (!panOk(cleanPan(d.pan))) p.push("PAN looks wrong (e.g. ABCDE1234F)");
  const s = Number(d.share_pct);
  if (!(s > 0 && s <= 100)) p.push("Share % between 1 and 100");
  if (d.dob && isMinor(d.dob) && !d.guardian_name.trim()) p.push("Guardian's name (nominee is under 18)");
  return p;
}

/** Shares must add up to 100. */
export function shareTotal(list: { share_pct: number | string }[]) {
  return Math.round(list.reduce((n, x) => n + Number(x.share_pct || 0), 0) * 100) / 100;
}

/** Aadhaar as shown and printed: XXXX XXXX 1234 */
export const maskedAadhaar = (last4: string | null) => (last4 ? `XXXX XXXX ${last4}` : "—");
