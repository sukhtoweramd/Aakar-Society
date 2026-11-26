// Which society a backup, a backup file in R2 and a login belong to (multi-tenant step 4d-1, Nov 2026).
// Pure helpers, so a test can import this file (it must not import lib/supabaseClient or lib/backup).
// R2 layout (decided here, small and backward compatible): the FIRST society (Aakar) keeps its existing flat names `backups/<name>.json`;
// every other society uses its own folder `backups/<society id>/<name>.json`. A society can list and read only its own folder.
import { FIRST_SOCIETY_ID, type MembershipRow } from "./memberships";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY = new RegExp(`^backups/(?:(${UUID})/)?[\\w.-]+\\.json$`, "i");

/** The R2 folder that holds this society's backups (no trailing slash). */
export const backupFolderOf = (society: string): string => (society === FIRST_SOCIETY_ID ? "backups" : `backups/${society}`);

/** True when the key is a well-formed backup name (flat = the first society's, or inside one society folder). */
export const isBackupKey = (key: string): boolean => KEY.test(key);

/** Which society a stored backup key belongs to (null = not a backup key). */
export function societyOfBackupKey(key: string): string | null {
  const m = KEY.exec(key);
  return m ? (m[1] ? m[1].toLowerCase() : FIRST_SOCIETY_ID) : null;
}

/** May this society read this key? Only its own. */
export const keyBelongsTo = (society: string, key: string): boolean => societyOfBackupKey(key) === society.toLowerCase();

/**
 * Logins to list in a society's backup (reference only): those with a membership in that society.
 * A login with no membership at all belongs to no society (MT_17: no first-society fallback).
 */
export function loginsOfSociety<T extends { id: string }>(users: T[], memberships: Pick<MembershipRow, "user_id" | "society_id">[], society: string): T[] {
  const byUser = new Map<string, Set<string>>();
  for (const m of memberships) { const s = byUser.get(m.user_id) || new Set<string>(); s.add(m.society_id.toLowerCase()); byUser.set(m.user_id, s); }
  return users.filter((u) => {
    const s = byUser.get(u.id);
    return s ? s.has(society.toLowerCase()) : false;
  });
}

/**
 * A backup file may only be restored into the society it was made from. Files made before this change carry no society id:
 * they are the first society's. Returns an error text, or null when the file may be restored here.
 */
export function backupSocietyError(b: { society_id?: string | null }, society: string): string | null {
  const from = (b.society_id || FIRST_SOCIETY_ID).toLowerCase();
  return from === society.toLowerCase() ? null : "This backup was made from a different society and cannot be restored here.";
}
