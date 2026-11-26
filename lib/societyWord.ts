// The "society word" (multi-tenant, Nov 2026): the short lowercase name in a society's web address, e.g. /sample-gardens. It is the `slug` of the
// `societies` table. Flat logins of a society other than the first carry it inside their internal login address so the same flat number
// (A101) in two societies never collides. Aakar, the first society, keeps its old addresses (a101@flats.aakarsociety.app): nothing changes for it.
// Pure helpers (no Supabase import) so tests can load this file.

/** The first society's word. Its flat logins keep the old address form. */
export const FIRST_SOCIETY_WORD = "aakar";
/** Same rule as the database (societies.slug). */
export const WORD_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
/** First path parts that are the app's own pages, never a society word. */
export const RESERVED_WORDS = ["api", "ledger", "platform", "login", "logout", "admin", "static", "assets", "_next", "icons", "manifest", "offline", "sw", "favicon"];

/** What was typed or found in the address -> a clean word, or null when it cannot be one. */
export function cleanWord(input: string | null | undefined): string | null {
  const w = String(input ?? "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!WORD_PATTERN.test(w) || RESERVED_WORDS.includes(w)) return null;
  return w;
}

/** The word in the first part of a path ("/sample-gardens/anything" -> "sample-gardens"), or null. */
export function wordFromPath(pathname: string | null | undefined): string | null {
  const first = String(pathname ?? "").split("/").filter(Boolean)[0];
  return cleanWord(first);
}

/** Does this society's flat login use the old address form (no word inside)? True for no word and for the first society. */
export const usesLegacyAddress = (word: string | null | undefined) => !word || word === FIRST_SOCIETY_WORD;

/** The faint building picture on printed papers (public/print/building-bg.jpg) is Aakar's own building: only the first society prints it; every other society's papers stay plain. */
export const hasBuildingBackground = (word: string | null | undefined) => usesLegacyAddress(word);

/** The part after the @ for a flat login: "flats.aakarsociety.app" (first society) or "sample-gardens.flats.aakarsociety.app". */
export function residentDomain(baseDomain: string, word?: string | null): string {
  return usesLegacyAddress(word) ? baseDomain : `${word}.${baseDomain}`;
}

/** The society word inside a flat-login domain, or null for the old form / not a flat-login domain. */
export function wordFromDomain(domain: string, baseDomain: string): string | null {
  const d = domain.toLowerCase();
  if (d === baseDomain) return null;
  if (!d.endsWith(`.${baseDomain}`)) return null;
  return cleanWord(d.slice(0, -(baseDomain.length + 1)));
}
