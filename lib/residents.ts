// Flat logins use an internal email address so residents can log in with just their flat number.
export const RESIDENT_DOMAIN = "flats.aakarsociety.app";
/** Positions 1 and 2 of the B building that are separate flats, not one joined home. */
export const SEPARATE_FLATS = ["B101", "B102"];
/** "A-101", "a101", "A 101" -> "A101" (or null if it isn't a flat number) */
export function normaliseFlat(input: string): string | null {
  const m = input.trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{2,5})(?:\s*\/\s*\d{2,5})?$/);
  if (!m) return null;
  // B building: positions 1 + 2 of every floor are one 4 BHK home under the first number (B202 -> B201, "B-201/202" -> B201).
  // Exception (30 Oct 2026): B101 and B102 are two separate flats, each with its own login.
  if (m[1] === "B" && m[2].endsWith("02") && !SEPARATE_FLATS.includes(`B${m[2]}`)) return `B${m[2].slice(0, -2)}01`;
  if (m[1] === "B" && SEPARATE_FLATS.includes(`B${m[2]}`) && input.includes("/")) return null; // "B-101/102" is no longer one flat
  return `${m[1]}${m[2]}`;
}
export const flatEmail = (flatId: string) => `${flatId.toLowerCase()}@${RESIDENT_DOMAIN}`;
export const isFlatEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${RESIDENT_DOMAIN}`);
