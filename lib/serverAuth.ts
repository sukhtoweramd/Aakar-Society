import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseClient";
import { roleOf } from "./roles";

// flatId: the OWNER's flat login only. A tenant login has flatId null and tenantFlatId set (only while the database
// says the tenant login is active and the flat is still rented), so every existing "own flat" check refuses tenants.
export type Authed = { db: SupabaseClient; email: string; userId: string; isCommittee: boolean; flatId: string | null; isTenant?: boolean; tenantFlatId?: string | null };

/**
 * Checks the "Authorization: Bearer <token>" header sent by the logged-in browser.
 * Returns a Supabase client acting AS that user (so RLS still applies), plus their role.
 * Role comes from app_metadata, which only the server (secret key) can set. No role → no access (returns null).
 */
export async function getAuthedClient(req: NextRequest): Promise<Authed | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const meta = (data.user.app_metadata || {}) as Record<string, any>;
  const role = roleOf(meta);
  if (!role) return null; // a login with no role has no access at all
  const isResident = role === "resident";
  if (role === "tenant") {
    const { data: tf, error: te } = await db.rpc("my_tenant_flat");
    if (te || !tf) return null;   // revoked, moved out, or TENANT_LOGINS.sql not run
    return { db, email: data.user.email || "", userId: data.user.id, isCommittee: false, flatId: null, isTenant: true, tenantFlatId: String(tf) };
  }
  return { db, email: data.user.email || "", userId: data.user.id, isCommittee: role === "committee", flatId: isResident ? String(meta.flat_id || "") || null : null };
}

/** Server-only admin client (secret / service_role key). Never sent to the browser. */
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
