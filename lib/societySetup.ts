// Society setup read by the app (19 Nov 2026): the society_profile row and the towers rows (FLAT_SETUP_TABLES.sql).
// Pure helpers only (no supabaseClient), so tests can import this file. Every value falls back to what the code has
// always had (SOCIETY, TERRACE_TOWERS, the towers found in the flats), so a missing / empty / unreadable table changes nothing.
import { SOCIETY, TERRACE_TOWERS } from "./society";

export type SocietyProfile = typeof SOCIETY;
export type TowerInfo = { code: string; name: string; terrace: boolean };

/** The profile as the code has it today; used for every field the table leaves empty. */
export const FALLBACK_PROFILE: SocietyProfile = { ...SOCIETY, addressLines: [...SOCIETY.addressLines] };

const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

/** society_profile row -> the SOCIETY shape. Empty or missing fields keep today's value. */
export function profileFromRow(row: any): SocietyProfile {
  const fb = FALLBACK_PROFILE;
  if (!row || typeof row !== "object") return { ...fb, addressLines: [...fb.addressLines] };
  const lines = Array.isArray(row.address_lines) ? row.address_lines.filter((l: unknown) => typeof l === "string" && l.trim()).map((l: string) => l.trim()) : [];
  return {
    name: text(row.name, fb.name),
    full: text(row.full_name, fb.full),
    reg: text(row.reg_no, fb.reg),
    regDate: text(row.reg_date, fb.regDate),
    building: text(row.building, fb.building),
    address: text(row.address, fb.address),
    addressLines: lines.length ? lines : [...fb.addressLines],
    city: text(row.city, fb.city),
  };
}

/** Puts the profile into SOCIETY (the one object every screen and print window reads). Call once after login, before the
 *  app is shown. SOCIETY is changed in place so the 25 places that read it need no change. */
export function applySocietyProfile(p: SocietyProfile) {
  Object.assign(SOCIETY, p, { addressLines: [...p.addressLines] });
}

/** Towers for selects, filters and charges: the active rows of `towers`, in their order, plus any tower a flat uses that
 *  the table does not list (never hide a flat). No usable rows: the towers found in the flats, terrace as today's
 *  TERRACE_TOWERS; no flats either: A, B, C as before. */
export function towersFromRows(rows: any[] | null | undefined, flats: { tower?: string | null }[] = []): TowerInfo[] {
  const used = Array.from(new Set(flats.map((f) => (f.tower || "").trim()).filter(Boolean))).sort();
  const valid = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.code === "string" && r.code.trim());
  const out: TowerInfo[] = valid
    .filter((r) => r.active !== false)
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.code).localeCompare(String(b.code)))
    .map((r) => ({ code: String(r.code).trim(), name: text(r.name, `Tower ${String(r.code).trim()}`), terrace: !!r.has_terrace }));
  if (!valid.length) {
    const codes = used.length ? used : ["A", "B", "C"];
    return codes.map((code) => ({ code, name: `Tower ${code}`, terrace: TERRACE_TOWERS.includes(code) }));
  }
  // a tower the flats use but the list leaves out (no row, or switched off) is still shown: a flat is never hidden
  const shown = new Set(out.map((x) => x.code));
  for (const code of used) {
    if (shown.has(code)) continue;
    const row = valid.find((r) => String(r.code).trim() === code);
    out.push({ code, name: row ? text(row.name, `Tower ${code}`) : `Tower ${code}`, terrace: row ? !!row.has_terrace : false });
  }
  return out;
}

/** Codes of the towers whose top floor is a terrace (for buildCategories). */
export const terraceCodes = (towers: TowerInfo[]) => towers.filter((t) => t.terrace).map((t) => t.code);

// Last profile seen on this device, so the login screen (before login the table cannot be read) shows the society's name.
// Only the public society details are kept: no resident data. Storage can be missing or blocked: every call is guarded.
const CACHE_KEY = "society_profile_v1";
type Store = Pick<Storage, "getItem" | "setItem">;
export function readCachedProfile(store: Store | null | undefined): SocietyProfile | null {
  try {
    const raw = store?.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? profileFromRow({ name: j.name, full_name: j.full, reg_no: j.reg, reg_date: j.regDate, building: j.building, address: j.address, address_lines: j.addressLines, city: j.city }) : null;
  } catch { return null; }
}
export function writeCachedProfile(store: Store | null | undefined, p: SocietyProfile) {
  try { store?.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
