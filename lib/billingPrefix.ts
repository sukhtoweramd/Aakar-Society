// Pure helpers for number prefixes (no database import, so tests can load it).

/** Example for the Numbering help text: the society's own bill prefix with the financial year moved on ("TP/26-27/" -> "TP/27-28/"). Empty / no year in it -> a neutral example. */
export function nextYearExample(prefix: string | null | undefined): string {
  const p = String(prefix || "").trim();
  const m = p.match(/(\d{2})-(\d{2})/);
  if (!m) return "XYZ/27-28/";
  const a = (+m[1] + 1) % 100, b = (+m[2] + 1) % 100;
  const two = (n: number) => String(n).padStart(2, "0");
  return p.replace(m[0], `${two(a)}-${two(b)}`);
}

/** Letter prefix to use when the box is left empty, built from the society's own bill prefix: "TP/26-27/" -> "TP/L/26-27/"; no bill prefix -> "L/". Never another society's letters. */
export function letterPrefixFallback(billPrefix: string | null | undefined): string {
  const p = String(billPrefix || "").trim();
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return "L/";
  const [code, ...rest] = parts;
  return [code, "L", ...rest].join("/") + "/";
}
