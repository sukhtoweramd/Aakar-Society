// Is this login the main admin? (MAIN_ADMIN_EMAIL in Vercel if set, otherwise the oldest committee login.)
// Server only. Used for the actions that only the main admin may do (PR-14, PR-15).
import type { SupabaseClient } from "@supabase/supabase-js";
import { allUsers, isCommitteeUser, mainAdminId } from "./backup";

export async function isMainAdminUser(admin: SupabaseClient, userId: string): Promise<boolean> {
  const committee = (await allUsers(admin)).filter(isCommitteeUser);
  return mainAdminId(committee) === userId;
}
