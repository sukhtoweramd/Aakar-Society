// Flat generator for a society that has no flats yet (19 Nov 2026). Pure file (no supabaseClient): used by the ADMIN preview
// AND by the server route /api/flat-plan, which builds the list again from these same numbers (it never trusts a list from the browser).
// Numbering: tower letter + floor + 2-digit position: A101, A102 … A1001 (the form the rest of the app reads, see lib/society.ts).

import { FLAT_RULES, normaliseFlat, type FlatRules } from "./residents";

export type TowerPlan = {
  code: string;        // one letter A-Z: member logins and flat numbers are built from it
  floors: number;      // floors 1 … floors
  perFloor: number;    // flats on each floor (1-99)
  terrace: boolean;    // top floor pays the terrace rate
  maint: number;       // yearly maintenance, rupees, standard floors
  maintTerrace: number; // yearly maintenance, rupees, terrace floor (used when terrace)
  /** Typed floor by floor (flat numbers as the society writes them). When present, `floors` and `perFloor` are not used. */
  layout?: { floor: number; numbers: string[] }[];
};
export type PlannedFlat = { id: string; tower: string; floor: number; flat_no: string; maintenance: number };

export const MAX_FLOORS = 60;
export const MAX_PER_FLOOR = 40;
export const MAX_FLATS = 1000;
export const MAX_MAINT = 1_000_000;

export const flatNumberFor = (code: string, floor: number, unit: number) => `${code}${floor}${String(unit).padStart(2, "0")}`;

/** "D101, D-102  d103" -> ["D101", "D102", "D103"] (letters made capital, dash and spaces inside a number removed). */
export const parseNumbers = (text: string): string[] =>
  String(text || "").split(/[,;\n]+|\s{2,}|\s(?=[A-Za-z]\s*-?\s*\d)/).map((x) => x.replace(/[\s-]+/g, "").toUpperCase()).filter(Boolean);

const whole = (n: unknown) => typeof n === "number" && Number.isInteger(n);

/** Error text for the plan, or "" when it can be created. */
export function planError(towers: TowerPlan[]): string {
  if (!Array.isArray(towers) || towers.length === 0) return "Add at least one tower.";
  const seen = new Set<string>();
  let total = 0;
  const allNumbers = new Set<string>();
  for (const t of towers) {
    const c = String(t?.code ?? "");
    if (!/^[A-Z]$/.test(c)) return `Tower code "${c}": flat numbers need a single capital letter (A to Z).`;
    if (seen.has(c)) return `Tower ${c} is listed twice.`;
    seen.add(c);
    if (t.layout) {
      if (!Array.isArray(t.layout) || t.layout.length === 0) return `Tower ${c}: add at least one floor.`;
      const floorsSeen = new Set<number>();
      for (const row of t.layout) {
        if (!whole(row?.floor) || row.floor < 1 || row.floor > MAX_FLOORS) return `Tower ${c}: a floor must be a whole number from 1 to ${MAX_FLOORS}.`;
        if (floorsSeen.has(row.floor)) return `Tower ${c}: floor ${row.floor} is listed twice.`;
        floorsSeen.add(row.floor);
        const nums = Array.isArray(row.numbers) ? row.numbers : [];
        if (nums.length < 1) return `Tower ${c}, floor ${row.floor}: type the flat numbers.`;
        if (nums.length > MAX_PER_FLOOR) return `Tower ${c}, floor ${row.floor}: at most ${MAX_PER_FLOOR} flats on a floor.`;
        for (const n of nums) {
          if (!/^[A-Z]\d{2,5}$/.test(n)) return `"${n}" is not a flat number: use one capital letter and 2 to 5 digits, like ${c}101.`;
          if (normaliseFlat(n) !== n) return `${n}: in this copy of the app that number logs in as ${normaliseFlat(n)} (joined home rule, FLAT_RULES in lib/residents.ts), so it cannot be created as a flat of its own.`;
          if (allNumbers.has(n)) return `Flat ${n} is typed twice.`;
          allNumbers.add(n);
        }
        total += nums.length;
      }
    } else {
    if (!whole(t.floors) || t.floors < 1 || t.floors > MAX_FLOORS) return `Tower ${c}: floors must be a whole number from 1 to ${MAX_FLOORS}.`;
    if (!whole(t.perFloor) || t.perFloor < 1 || t.perFloor > MAX_PER_FLOOR) return `Tower ${c}: flats per floor must be a whole number from 1 to ${MAX_PER_FLOOR}.`;
    }
    if (!whole(t.maint) || t.maint < 0 || t.maint > MAX_MAINT) return `Tower ${c}: maintenance must be a whole rupee amount from 0 to ${MAX_MAINT.toLocaleString("en-IN")}.`;
    if (t.terrace && (!whole(t.maintTerrace) || t.maintTerrace < 0 || t.maintTerrace > MAX_MAINT)) return `Tower ${c}: terrace maintenance must be a whole rupee amount from 0 to ${MAX_MAINT.toLocaleString("en-IN")}.`;
    if (!t.layout) total += t.floors * t.perFloor;
  }
  if (total > MAX_FLATS) return `That makes ${total} flats; the most this screen creates is ${MAX_FLATS}.`;
  return "";
}

/** The flats of the plan, in tower / floor / position order. Throws when the plan is not valid. */
export function buildFlatPlan(towers: TowerPlan[]): PlannedFlat[] {
  const err = planError(towers);
  if (err) throw new Error(err);
  const out: PlannedFlat[] = [];
  for (const t of [...towers].sort((a, b) => a.code.localeCompare(b.code))) {
    if (t.layout) {
      const top = Math.max(...t.layout.map((r) => r.floor));
      for (const row of [...t.layout].sort((a, b) => a.floor - b.floor)) {
        const maintenance = t.terrace && row.floor === top ? t.maintTerrace : t.maint;
        for (const no of row.numbers) out.push({ id: no, tower: t.code, floor: row.floor, flat_no: no, maintenance });
      }
      continue;
    }
    for (let floor = 1; floor <= t.floors; floor++) {
      const maintenance = t.terrace && floor === t.floors ? t.maintTerrace : t.maint;
      for (let unit = 1; unit <= t.perFloor; unit++) {
        const no = flatNumberFor(t.code, floor, unit);
        out.push({ id: no, tower: t.code, floor, flat_no: no, maintenance });
      }
    }
  }
  return out;
}

/** Planned flat numbers that already exist (any tower). */
export const planClashes = (plan: PlannedFlat[], existingIds: string[]) => {
  const have = new Set(existingIds.map((i) => String(i).trim().toUpperCase()));
  return plan.map((f) => f.id).filter((id) => have.has(id));
};

/** Short summary lines for the preview: one per tower. */
export function planSummary(towers: TowerPlan[]) {
  return towers.map((t) => {
    if (t.layout) {
      const rows = [...t.layout].sort((a, b) => a.floor - b.floor);
      const all = rows.flatMap((r) => r.numbers);
      return { code: t.code, flats: all.length, first: all[0] || "", last: all[all.length - 1] || "", terraceFlats: t.terrace && rows.length ? rows[rows.length - 1].numbers.length : 0 };
    }
    const n = t.floors * t.perFloor;
    return { code: t.code, flats: n, first: flatNumberFor(t.code, 1, 1), last: flatNumberFor(t.code, t.floors, t.perFloor), terraceFlats: t.terrace ? t.perFloor : 0 };
  });
}

/** A tower the login lookup treats as joined homes (lib/residents.ts FLAT_RULES) cannot hold ordinary flats at position 02: B102 would log in as B101. */
export const planWarnings = (towers: TowerPlan[], rules: FlatRules = FLAT_RULES) =>
  towers.filter((t) => !t.layout && rules.joinedLetters.includes(t.code) && t.perFloor >= 2)
    .map((t) => `Tower ${t.code}: this copy of the app treats flats ${t.code}102, ${t.code}202 … as one joined home with ${t.code}101, ${t.code}201 …, so ${t.code}102 could not log in on its own. Use another letter, or switch the rule off (FLAT_RULES in lib/residents.ts) before creating this tower.`);
