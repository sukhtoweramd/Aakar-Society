// Important contacts (CONTACTS tab, CONTACTS.sql, 30 Oct 2026): society-level phone numbers such as lift, fire, MyGate,
// security, plumber. Members see active ones; committee logins add, edit and switch them off (never delete).
// Pure helpers only (no database code), so tests can load this file.

export type Contact = {
  id: string; category: string; name: string; contact_person: string | null; phone: string | null; alt_phone: string | null;
  notes: string | null; sort_order: number; active: boolean; amc_id: string | null;
  created_by?: string | null; created_at?: string; updated_by?: string | null; updated_at?: string;
};

/** Suggested categories (the committee can type any other). */
export const CONTACT_CATEGORIES = ["Lift", "Fire", "Security", "MyGate", "CCTV", "Electricity", "Torrent Power", "Water / Borewell",
  "Plumber", "Garbage collection (AMC)", "Parkview", "Hospital / Ambulance", "Police", "Other"];

/** Phone number as a tap-to-call link: keeps digits and a leading +; empty when there is nothing to dial. */
export function telHref(phone?: string | null): string {
  const p = (phone || "").trim();
  const digits = p.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return digits.replace(/\D/g, "").length >= 3 ? `tel:${digits}` : "";
}

/** Categories in first-seen order of the sorted list; contacts by sort order, then name. */
export function groupContacts(list: Contact[]): [string, Contact[]][] {
  const sorted = [...list].sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const order = Array.from(new Set(sorted.map((c) => c.category.trim() || "Other")));
  return order.map((cat) => [cat, sorted.filter((c) => (c.category.trim() || "Other") === cat)]);
}

/** Search across category, name, person, phones and notes. */
export function matchContact(c: Contact, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\D/g, "");
  return [c.category, c.name, c.contact_person, c.notes].some((v) => (v || "").toLowerCase().includes(s))
    || (digits.length >= 3 && [c.phone, c.alt_phone].some((v) => (v || "").replace(/\D/g, "").includes(digits)));
}

/** Form check before saving: returns an error text, or "" when fine. */
export function contactError(c: Pick<Contact, "category" | "name" | "phone" | "alt_phone">): string {
  if (!c.category?.trim()) return "Choose or type a CATEGORY.";
  if (!c.name?.trim()) return "Enter the SERVICE / NAME.";
  if (!c.phone?.trim() && !c.alt_phone?.trim()) return "Enter at least one PHONE number.";
  for (const p of [c.phone, c.alt_phone]) if (p?.trim() && !telHref(p)) return `"${p}" does not look like a phone number.`;
  return "";
}
