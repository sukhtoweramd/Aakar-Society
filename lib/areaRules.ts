// Areas of responsibility: backups and complaint routing (30 Oct 2026). No database code here, so tests can load it.

/** Backups of an area (AREAS_BACKUPS.sql), or the single older backup_flat. */
export const backupsOf = (a: { backup_flat?: string | null; backup_flats?: string[] | null }): string[] =>
  Array.isArray(a.backup_flats) ? a.backup_flats.filter(Boolean) : a.backup_flat ? [a.backup_flat] : [];
/** What this login may do with areas (database decides; the screen only follows). */
export type AreaRights = { manage: boolean; assign: boolean; limit: number };
/** Check an assignment before saving (the database checks the same). Returns an error text or "". */
export function assignmentError(holder: string | null, backups: string[], limit: number, isCommitteeFlat: (id: string) => boolean, before: string[] = []): string {
  const list = backups.filter(Boolean);
  if (new Set(list).size !== list.length) return "A member is chosen twice as backup.";
  if (holder && list.includes(holder)) return "The responsible member cannot also be a backup for the same area.";
  if (list.length > limit) return `At most ${limit} backups per area.`;
  const fresh = [holder, ...list].filter((x): x is string => !!x && !before.includes(x));
  const bad = fresh.filter((x) => !isCommitteeFlat(x));
  return bad.length ? `Not on the committee: ${bad.join(", ")}.` : "";
}

/** Is this flat the responsible member or a backup of the complaint? */
export const isHandler = (c: { assigned_flat: string | null; backup_flat: string | null; backup_flats?: string[] | null }, flatId: string | null | undefined) =>
  !!flatId && (c.assigned_flat === flatId || c.backup_flat === flatId || (Array.isArray(c.backup_flats) && c.backup_flats.includes(flatId)));
