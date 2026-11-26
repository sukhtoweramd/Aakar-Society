// The product owner ("platform owner", multi-tenant, Nov 2026): the one login that creates societies at /platform.
// It is named by the Vercel variable PLATFORM_OWNER_EMAIL, and it must belong to NO society (no membership, no role): it sees
// societies as counts only (a screen rule: the server never sends names, phone numbers, bills or any resident data to this page).
// Pure helpers (no Supabase import) so tests can load this file.
import { cleanWord } from "./societyWord";
import { roleOf } from "./roles";
import { societyOwnerId, type OwnerMembership, type OwnerUser } from "./societyOwner";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Is this login the product owner? The variable must be set, the email must match, and the login must have no society membership. */
export function isPlatformOwner(email: string | null | undefined, envEmail: string | null | undefined, membershipCount: number): boolean {
  const want = (envEmail || "").trim().toLowerCase();
  const got = (email || "").trim().toLowerCase();
  return !!want && !!got && want === got && membershipCount === 0;
}

export type NewSociety = { name: string; word: string; ownerEmail: string };

/** Clean and check what was typed on the "new society" form. Throws a short message the screen can show. */
export function newSocietyInput(raw: { name?: unknown; word?: unknown; ownerEmail?: unknown }): NewSociety {
  const name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80) throw new Error("The society name must be 3 to 80 letters.");
  const word = cleanWord(String(raw.word ?? ""));
  if (!word) throw new Error("The society word must be 3 to 40 small letters, digits or hyphens (not a reserved word like platform or api).");
  const ownerEmail = String(raw.ownerEmail ?? "").trim().toLowerCase();
  if (!EMAIL.test(ownerEmail)) throw new Error("Enter a valid email address for the society owner.");
  if (/@flats\.|\.flats\./.test(ownerEmail)) throw new Error("That is a flat login address.");
  return { name, word, ownerEmail };
}

/** The society's first profile row: its own name, nothing of Aakar's (an empty field stays empty). */
export function firstProfileRow(societyId: string, name: string) {
  return { society_id: societyId, id: 1, name, full_name: name };
}

export type SocietyRow = { id: string; slug: string; name: string; status: string; created_at: string };
export type SocietyListItem = {
  id: string; slug: string; name: string; status: string; created_at: string;
  owner_email: string | null; flats: number; logins: { committee: number; flat: number; tenant: number };
};

/** One line per society for the platform page: counts only. `flatCounts` is flats per society id. */
export function societyList(societies: SocietyRow[], users: (OwnerUser & { email?: string | null })[], memberships: OwnerMembership[], flatCounts: Record<string, number>): SocietyListItem[] {
  return societies.map((s) => {
    const mine = memberships.filter((m) => m.society_id.toLowerCase() === s.id.toLowerCase());
    const byRole = (r: string[]) => mine.filter((m) => r.includes(String(m.role))).length;
    const ownerId = societyOwnerId(users, memberships, s.id, null);
    return {
      id: s.id, slug: s.slug, name: s.name, status: s.status, created_at: s.created_at,
      owner_email: ownerId ? users.find((u) => u.id === ownerId)?.email || null : null,
      flats: flatCounts[s.id] || 0,
      logins: { committee: byRole(["committee", "society_admin"]), flat: byRole(["flat"]), tenant: byRole(["tenant"]) },
    };
  }).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** True when the login's app metadata has no role (the product owner login must have none). */
export const hasNoRole = (appMeta: unknown) => roleOf(appMeta) === null;
