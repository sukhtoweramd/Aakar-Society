// Society membership of a login (multi-tenant, Nov 2026). Table: public.society_memberships (multitenant/MT_01_SOCIETIES.sql).
// Every login the server creates gets a membership in the same society as the person creating it. Pure helpers here, so a test can import
// this file (it must not import lib/supabaseClient). The first society (Aakar) has a fixed id that is not a secret.
import type { SupabaseClient } from "@supabase/supabase-js";

export const FIRST_SOCIETY_ID = "a4a4a4a4-0000-4000-8000-000000000001";
export type MembershipRole = "society_admin" | "committee" | "flat" | "tenant";
export type MembershipRow = { user_id: string; society_id: string; role: MembershipRole; flat_id: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The row to store; throws on a bad id or role so a typo never reaches the database. */
export function membershipRow(userId: string, societyId: string, role: MembershipRole, flatId?: string | null): MembershipRow {
  if (!UUID.test(userId)) throw new Error("Bad user id for the membership.");
  if (!UUID.test(societyId)) throw new Error("Bad society id for the membership.");
  if (!["society_admin", "committee", "flat", "tenant"].includes(role)) throw new Error("Bad membership role.");
  return { user_id: userId, society_id: societyId, role, flat_id: flatId ? String(flatId) : null };
}

/** The society of the person who is making the change (their oldest membership). TRANSITION: no membership yet = the first society. */
export async function societyOfCaller(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin.from("society_memberships").select("society_id").eq("user_id", userId)
    .order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  return (data && data[0]?.society_id) || FIRST_SOCIETY_ID;
}

/** Store the membership (one per login and society). Throws on failure; the caller removes the new login again. */
export async function addMembership(admin: SupabaseClient, row: MembershipRow): Promise<void> {
  const { error } = await admin.from("society_memberships").upsert(row, { onConflict: "user_id,society_id" });
  if (error) throw error;
}
