// Who is the society owner ("main admin") of a society (multi-tenant step 4d-2, Nov 2026). Pure helpers: a test can import this file
// (it must not import lib/supabaseClient or lib/backup).
//   First society: MAIN_ADMIN_EMAIL if that login belongs to the society, otherwise its oldest committee login (as before multi-tenancy).
//   Any other society: its member with the membership role "society_admin" (oldest if several);
//   if it has none yet, its oldest committee login (TRANSITION, so a society is never left without an owner).
// Only logins that belong to the society are looked at; a login of another society is never the owner.
import { isCommitteeMeta } from "./roles";
import { FIRST_SOCIETY_ID, type MembershipRole } from "./memberships";
import { loginsOfSociety } from "./backupScope";

export type OwnerUser = { id: string; email?: string | null; created_at?: string | null; app_metadata?: unknown };
export type OwnerMembership = { user_id: string; society_id: string; role: MembershipRole | string };

const oldestFirst = <T extends OwnerUser>(users: T[]) => [...users].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

/** The owner among committee logins that are already known to be in one society: the login named by `envEmail`, else the oldest. */
export function ownerByEmailOrOldest<T extends OwnerUser>(committee: T[], envEmail?: string | null): string | null {
  const env = (envEmail || "").trim().toLowerCase();
  if (env) { const u = committee.find((x) => (x.email || "").toLowerCase() === env); if (u) return u.id; }
  return oldestFirst(committee)[0]?.id || null;
}

/** Committee logins of one society (a login with no membership belongs to no society). */
export function committeeOfSociety<T extends OwnerUser>(users: T[], memberships: OwnerMembership[], society: string): T[] {
  return loginsOfSociety(users, memberships, society).filter((u) => isCommitteeMeta(u.app_metadata));
}

/** The owner of `society`, or null when it has no committee login at all. */
export function societyOwnerId<T extends OwnerUser>(users: T[], memberships: OwnerMembership[], society: string, envEmail?: string | null): string | null {
  const committee = committeeOfSociety(users, memberships, society);
  if (society.toLowerCase() === FIRST_SOCIETY_ID) return ownerByEmailOrOldest(committee, envEmail);
  const admins = new Set(memberships.filter((m) => m.society_id.toLowerCase() === society.toLowerCase() && m.role === "society_admin").map((m) => m.user_id));
  const named = oldestFirst(committee.filter((u) => admins.has(u.id)));
  return named[0]?.id || oldestFirst(committee)[0]?.id || null;
}
