// Documents each flat should give the society (Oct 2026, Chairman and Secretary).
// Plain logic only, shared by MY FLAT, REPORTS and the tests.

export type DocType = { key: string; name: string; onlyIfRented?: boolean; alias: RegExp };

export const DOC_TYPES: DocType[] = [
  { key: "index", name: "Index", alias: /\bindex\b/i },
  { key: "dastavej", name: "Dastavej", alias: /dastav[ae]j|sale\s*deed|conveyance/i },
  { key: "torrent", name: "Torrent Power bill", alias: /torrent|electric(ity)?\s*bill|light\s*bill/i },
  { key: "property_tax", name: "Property tax bill", alias: /property\s*tax|amc\s*tax|tax\s*bill/i },
  { key: "rent", name: "Rent agreement", onlyIfRented: true, alias: /rent|leave\s*(and|&)\s*licen[cs]e/i },
  { key: "share", name: "Share certificate", alias: /share\s*cert/i },
  { key: "allotment", name: "Allotment letter", alias: /allot+ment/i },
  { key: "prathmik", name: "Prathmik karar", alias: /prathmik|pratham|preliminary\s*agreement/i },
];
export const OTHER = "Other";

/** Which list entry a stored type belongs to ("Sale deed" → Dastavej). null = other / not set. */
export function docTypeOf(stored: string | null | undefined): DocType | null {
  const s = String(stored || "").trim();
  if (!s) return null;
  return DOC_TYPES.find((t) => t.name.toLowerCase() === s.toLowerCase()) || DOC_TYPES.find((t) => t.alias.test(s)) || null;
}

/** The documents this flat should have (rent agreement only when rented). */
export const requiredDocs = (rented: boolean) => DOC_TYPES.filter((t) => !t.onlyIfRented || rented);

/** Checklist: each required document and whether one is uploaded (from the stored types of this flat's files). */
export function docChecklist(storedTypes: (string | null | undefined)[], rented: boolean) {
  const have = new Set(storedTypes.map((s) => docTypeOf(s)?.key).filter(Boolean) as string[]);
  return requiredDocs(rented).map((t) => ({ ...t, uploaded: have.has(t.key) }));
}
