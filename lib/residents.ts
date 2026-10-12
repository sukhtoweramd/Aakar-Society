// Flat logins use an internal email address so residents can log in with just their flat number.
export const RESIDENT_DOMAIN = "flats.aakarsociety.app";
/** "A-101", "a101", "A 101" -> "A101" (or null if it isn't a flat number) */
export function normaliseFlat(input: string): string | null {
  const m = input.trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{2,5})$/);
  return m ? `${m[1]}${m[2]}` : null;
}
export const flatEmail = (flatId: string) => `${flatId.toLowerCase()}@${RESIDENT_DOMAIN}`;
export const isFlatEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${RESIDENT_DOMAIN}`);
