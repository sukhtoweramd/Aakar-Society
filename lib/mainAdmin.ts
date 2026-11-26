// Is this login the society owner ("main admin") of its society? Server only. Used for the actions that only the owner may do (PR-14, PR-15).
// The rule (one place, tested in tests/societyOwner.test.ts) is in lib/societyOwner.ts; here the users and memberships are read with the server key.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { allUsers } from "./backup";
import { societyOfCaller } from "./memberships";
import { committeeOfSociety, societyOwnerId, type OwnerMembership } from "./societyOwner";

async function membershipsOf(admin: SupabaseClient): Promise<OwnerMembership[]> {
  const out: OwnerMembership[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("society_memberships").select("user_id, society_id, role").range(from, from + 999);
    if (error) throw new Error(`society_memberships: ${error.message}`);
    out.push(...((data || []) as OwnerMembership[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The committee logins of one society and who owns it (the owner is one of them, or null when there is none). */
export async function societyCommittee(admin: SupabaseClient, society: string): Promise<{ committee: User[]; ownerId: string | null }> {
  const [users, memberships] = await Promise.all([allUsers(admin), membershipsOf(admin)]);
  return { committee: committeeOfSociety(users, memberships, society), ownerId: societyOwnerId(users, memberships, society, process.env.MAIN_ADMIN_EMAIL) };
}

export async function isMainAdminUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  const society = await societyOfCaller(admin, userId);
  return (await societyCommittee(admin, society)).ownerId === userId;
}
