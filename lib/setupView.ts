// How the society was built, for the read-only FLAT SETUP screen in ADMIN (19 Nov 2026).
// Pure helpers (no supabaseClient). Only structure goes out of here: tower, floor, flat number. Never names, mobiles or emails.
import { byFlatKey, floorOf, isJoined, label, type Flat } from "./society";
import type { TowerInfo } from "./societySetup";

type F = Pick<Flat, "id" | "tower" | "floor" | "flat_no">;

export type FloorRow = { floor: number; flats: string[] };
export type TowerView = {
  code: string; name: string; terrace: boolean;
  flats: number; firstFloor: number | null; lastFloor: number | null; first: string; last: string;
  floors: FloorRow[]; perFloor: string; // "4" or "2 to 4" (flats on a floor)
  inUse: boolean;
};

const lo = (n: number[]) => (n.length ? Math.min(...n) : null);
const hi = (n: number[]) => (n.length ? Math.max(...n) : null);

/** One view per tower of the setup: its flats by floor, first and last flat, and whether flats use it (then it is locked). */
export function towerViews(flats: F[], towers: TowerInfo[]): TowerView[] {
  return towers.map((t) => {
    const mine = flats.filter((f) => (f.tower || "").trim() === t.code).sort(byFlatKey);
    const byFloor = new Map<number, string[]>();
    for (const f of mine) {
      const fl = floorOf(f as Flat);
      byFloor.set(fl, [...(byFloor.get(fl) || []), label(f as Flat)]);
    }
    const floors = Array.from(byFloor.entries()).sort((a, b) => a[0] - b[0]).map(([floor, list]) => ({ floor, flats: list }));
    const counts = floors.map((r) => r.flats.length);
    const nums = floors.map((r) => r.floor);
    return {
      code: t.code, name: t.name, terrace: t.terrace,
      flats: mine.length, firstFloor: lo(nums), lastFloor: hi(nums),
      first: mine[0] ? label(mine[0] as Flat) : "", last: mine.length ? label(mine[mine.length - 1] as Flat) : "",
      floors, perFloor: !counts.length ? "" : lo(counts) === hi(counts) ? String(counts[0]) : `${lo(counts)} to ${hi(counts)}`,
      inUse: mine.length > 0,
    };
  });
}

export type Exceptions = {
  joined: { tower: string; flats: string[] }[];           // one home with two numbers, e.g. "B-201/202"
  otherLetter: { tower: string; flats: string[] }[];       // flat number starts with another letter than the tower (a B-building flat shown under Tower C)
};

const letterOf = (f: F) => ((f.flat_no || f.id || "").trim().match(/^[A-Za-z]/)?.[0] || "").toUpperCase();
const group = (list: F[]) => {
  const m = new Map<string, string[]>();
  for (const f of list) m.set((f.tower || "").trim(), [...(m.get((f.tower || "").trim()) || []), label(f as Flat)]);
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([tower, flats]) => ({ tower, flats }));
};

/** Where the numbering is not the plain pattern, so a new society can see what is optional: joined homes and flats whose letter is not the tower's. */
export function numberingExceptions(flats: F[]): Exceptions {
  const sorted = [...flats].sort(byFlatKey);
  return {
    joined: group(sorted.filter((f) => isJoined(f))),
    otherLetter: group(sorted.filter((f) => !!letterOf(f) && !!(f.tower || "").trim() && letterOf(f) !== (f.tower || "").trim().toUpperCase())),
  };
}

/** True when every flat's number is its tower letter + floor + two-digit unit (A-1003: tower A, floor 10, unit 03), ignoring the exceptions above. */
export function followsPattern(f: F): boolean {
  const m = (f.id || "").match(/^([A-Za-z])(\d+)$/);
  if (!m) return false;
  const n = parseInt(m[2], 10);
  return m[1].toUpperCase() === (f.tower || "").trim().toUpperCase() && Math.floor(n / 100) === floorOf(f as Flat);
}
