// Profession / Business categories (MY FAMILY form → society Business Directory).
// Stored as plain text in members.business_category (no database list or check), so the list lives here.
// Pure logic, no imports, so tests can load it directly.

/** The choices in the dropdown, in this order. "Other" stays last. */
export const PROFESSION_CATEGORIES = [
  "Doctor / Medical", "Legal / Lawyer", "Finance / CA", "IT / Software", "Engineering", "Education",
  "Retail / Shop", "Food", "Real Estate", "Manufacturing", "Automobile", "Government", "Service / Job",
  "Home Business", "Home Maker", "Student", "Other",
] as const;

/** Older saved names that now have a new name (Nov 2026). Saved rows keep the old text until the member saves again. */
const RENAMED: Record<string, string> = { medical: "Doctor / Medical", legal: "Legal / Lawyer" };

/**
 * The category to show for a saved value: a renamed one gets its new name, a known one gets the list's spelling,
 * an unknown one is kept as it was saved (never dropped), and an empty one stays empty.
 */
export function normalizeCategory(saved: string | null | undefined): string {
  const v = String(saved ?? "").trim();
  if (!v) return "";
  const key = v.toLowerCase();
  if (RENAMED[key]) return RENAMED[key];
  const known = PROFESSION_CATEGORIES.find((c) => c.toLowerCase() === key);
  return known || v;
}

/** The category for grouping and filtering in the directory: empty counts as "Other". */
export function directoryCategory(saved: string | null | undefined): string {
  return normalizeCategory(saved) || "Other";
}

/**
 * The dropdown choices for one member: the list, plus their saved value if it is not in the list
 * (placed just before "Other"), so an older or unusual saved value still shows and is saved unchanged.
 */
export function categoryOptions(current: string | null | undefined): string[] {
  const list: string[] = [...PROFESSION_CATEGORIES];
  const v = normalizeCategory(current);
  if (v && !list.includes(v)) list.splice(list.length - 1, 0, v);
  return list;
}
