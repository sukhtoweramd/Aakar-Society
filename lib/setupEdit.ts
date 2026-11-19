// Editing the society profile and the towers (19 Nov 2026): validation before anything is sent to the database.
// Pure helpers (no supabaseClient). The database repeats the important rules (main admin only, tower code format,
// a tower used by flats cannot be deleted or re-coded), so a wrong call from outside the screen fails there too.
import type { SocietyProfile } from "./societySetup";

export const TOWER_CODE = /^[A-Za-z0-9_-]{1,10}$/;
// control characters are never wanted in a name or address (a new line is only allowed between address lines)
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export type ProfileForm = { name: string; full: string; reg: string; regDate: string; building: string; address: string; lines: string; city: string };
export type ProfileRow = { name: string; full_name: string; reg_no: string; reg_date: string; building: string; address: string; address_lines: string[]; city: string };

export const profileToForm = (p: SocietyProfile): ProfileForm => ({
  name: p.name, full: p.full, reg: p.reg, regDate: p.regDate, building: p.building, address: p.address, lines: p.addressLines.join("\n"), city: p.city,
});

const LIMITS: [keyof Omit<ProfileForm, "lines">, string, number, boolean][] = [
  ["name", "Society name", 80, true], ["full", "Full name", 120, true], ["reg", "Registration no.", 40, false], ["regDate", "Registered on", 20, false],
  ["building", "Building", 60, false], ["address", "Address", 200, false], ["city", "City", 60, false],
];

/** Checks the form and returns the database row, or the list of things to fix. */
export function validateProfile(f: ProfileForm): { ok: true; row: ProfileRow } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const v = (s: string) => (s || "").trim();
  for (const [k, label, max, required] of LIMITS) {
    const x = v(f[k]);
    if (required && !x) errors.push(`${label} is needed.`);
    if (x.length > max) errors.push(`${label} is too long (most ${max} characters).`);
    if (CONTROL.test(x)) errors.push(`${label} has a character that cannot be printed.`);
  }
  const lines = (f.lines || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 4) errors.push("Address lines: at most 4 lines.");
  if (lines.some((l) => l.length > 80)) errors.push("Address lines: each line at most 80 characters.");
  if (lines.some((l) => CONTROL.test(l))) errors.push("Address lines have a character that cannot be printed.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, row: { name: v(f.name), full_name: v(f.full), reg_no: v(f.reg), reg_date: v(f.regDate), building: v(f.building), address: v(f.address), address_lines: lines, city: v(f.city) } };
}

type TowerRowLike = { code: string; sort?: number | null };

/** Error text for a new tower, or "" when it can be added. */
export function newTowerError(code: string, name: string, existing: TowerRowLike[]): string {
  const c = (code || "").trim();
  const n = (name || "").trim();
  if (!TOWER_CODE.test(c)) return "Tower code: 1 to 10 letters, numbers, - or _ (for example A or WING-1).";
  if (existing.some((t) => t.code.toLowerCase() === c.toLowerCase())) return `Tower ${c} already exists.`;
  if (!n) return "Give the tower a display name, for example Tower " + c + ".";
  if (n.length > 60) return "Display name: at most 60 characters.";
  if (CONTROL.test(n)) return "Display name has a character that cannot be printed.";
  return "";
}

/** Error text for a renamed tower, or "". */
export function towerNameError(name: string): string {
  const n = (name || "").trim();
  if (!n) return "The display name cannot be empty.";
  if (n.length > 60) return "Display name: at most 60 characters.";
  if (CONTROL.test(n)) return "Display name has a character that cannot be printed.";
  return "";
}

/** Sort value for a tower added at the end. */
export const nextTowerSort = (existing: TowerRowLike[]) => (existing.length ? Math.max(...existing.map((t) => Number(t.sort) || 0)) : 0) + 10;
