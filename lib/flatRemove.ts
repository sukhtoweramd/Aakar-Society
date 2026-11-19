// Removing flats that hold no data (19 Nov 2026). Pure file: the rows come from the database function public.flat_blockers
// (sql-security/15), called by the server only; empty `blockers` = the flat is empty.
export type FlatBlocker = { flat_id: string; blockers: string };
export const MAX_REMOVE = 1000;

/** True only when there is at least one flat and every one of them is empty. */
export const canRemoveAll = (rows: FlatBlocker[]) => rows.length > 0 && rows.every((r) => !r.blockers);

export function removeSummary(rows: FlatBlocker[], show = 8) {
  const held = rows.filter((r) => r.blockers);
  return { total: rows.length, empty: rows.length - held.length, held: held.length, examples: held.slice(0, show).map((r) => ({ id: r.flat_id, why: r.blockers })) };
}

/** Text for the screen after a check. */
export function removeText(rows: FlatBlocker[]): string {
  const s = removeSummary(rows);
  if (!s.total) return "No flats found.";
  if (!s.held) return s.total === 1 ? "This flat holds no data and can be removed." : `All ${s.total} flats hold no data and can be removed.`;
  return `${s.held} of ${s.total} flat${s.total === 1 ? "" : "s"} hold data, so nothing can be removed.`;
}
