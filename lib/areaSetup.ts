// Common areas for plot bookings (booking_areas): checks before saving and the order helper for the ADMIN screen (19 Nov 2026).
// Pure helpers (no supabaseClient). The database keeps the real rules: name is unique, an area with bookings cannot be deleted,
// the charge moves only through set_booking_charge (BOOKING_CHARGES.sql).
import { sortAreas } from "./bookings";

export const AREA_NAME_MAX = 60;
export const AREA_DESC_MAX = 200;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

type A = { id: string; name: string; sort: number };

/** Error text for an area name, or "". `selfId` is the area being renamed (its own name does not count as a duplicate). */
export function areaNameError(name: string, existing: Pick<A, "id" | "name">[], selfId?: string): string {
  const n = (name || "").trim();
  if (!n) return "The area needs a name.";
  if (n.length > AREA_NAME_MAX) return `Area name: at most ${AREA_NAME_MAX} characters.`;
  if (CONTROL.test(n)) return "The name has a character that cannot be printed.";
  if (existing.some((a) => a.id !== selfId && a.name.trim().toLowerCase() === n.toLowerCase())) return `There is already an area called "${n}".`;
  return "";
}

export function areaDescError(desc: string): string {
  const d = (desc || "").trim();
  if (d.length > AREA_DESC_MAX) return `Description: at most ${AREA_DESC_MAX} characters.`;
  if (CONTROL.test(d)) return "The description has a character that cannot be printed.";
  return "";
}

/** Sort value for an area added at the end (hidden areas count too). */
export const nextAreaSort = (areas: Pick<A, "sort">[]) => (areas.length ? Math.max(...areas.map((a) => Number(a.sort) || 0)) : 0) + 10;

/** Moves one area up (-1) or down (+1) and renumbers the list 10, 20, 30 …; returns only the rows whose sort changes. */
export function moveArea(areas: A[], id: string, dir: -1 | 1): { id: string; sort: number }[] {
  const list = sortAreas(areas);
  const i = list.findIndex((a) => a.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [];
  [list[i], list[j]] = [list[j], list[i]];
  return list.map((a, k) => ({ id: a.id, sort: (k + 1) * 10, was: a.sort })).filter((r) => r.sort !== r.was).map(({ id: x, sort }) => ({ id: x, sort }));
}

/** An area with bookings (any status) is kept: hide it instead. The database refuses the delete as well. */
export const canDeleteArea = (bookingCount: number) => bookingCount === 0;
