import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseClient";

/**
 * Checks the "Authorization: Bearer <token>" header sent by the logged-in browser.
 * Returns a Supabase client acting AS that user (so RLS still applies), or null.
 */
export async function getAuthedClient(req: NextRequest): Promise<{ db: SupabaseClient; email: string } | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { db, email: data.user.email || "" };
}
