// Flat logins use an internal email address so residents can log in with just their flat number.
export const RESIDENT_DOMAIN = "flats.aakarsociety.app";
/** "A-101", "a101", "A 101" -> "A101" (or null if it isn't a flat number) */
export function normaliseFlat(input: string): string | null {
  const m = input.trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{2,5})(?:\s*\/\s*\d{2,5})?$/);
  if (!m) return null;
  // B building: positions 1 + 2 of every floor are one 4 BHK home under the first number (B102 -> B101, "B-101/102" -> B101)
  if (m[1] === "B" && m[2].endsWith("02")) return `B${m[2].slice(0, -2)}01`;
  return `${m[1]}${m[2]}`;
}
export const flatEmail = (flatId: string) => `${flatId.toLowerCase()}@${RESIDENT_DOMAIN}`;
export const isFlatEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${RESIDENT_DOMAIN}`);
