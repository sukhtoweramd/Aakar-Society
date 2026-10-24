// Who a login is. The role is in app_metadata, which only the server (secret key) can set:
//   "committee" → committee login (email)      "resident" → flat login (flat number)
// Anything else, including no role at all, gets NO access. (Before Oct 2026 "not resident" counted as committee.)
export type Role = "committee" | "resident" | null;
export function roleOf(appMetadata: unknown): Role {
  const r = (appMetadata as Record<string, unknown> | null | undefined)?.role;
  return r === "committee" || r === "resident" ? r : null;
}
export const isCommitteeMeta = (appMetadata: unknown) => roleOf(appMetadata) === "committee";
export const isResidentMeta = (appMetadata: unknown) => roleOf(appMetadata) === "resident";
