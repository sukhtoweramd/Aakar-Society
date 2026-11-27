// Reads society_public(word) on the server with the PUBLISHABLE key only (the same call the login page makes before login): name and logo of an
// active society. No server key here on purpose. Used by the installed-app manifest, icon and page title for a society's own address.
import { createClient } from "@supabase/supabase-js";
import type { PublicSociety } from "./societyPwa";

export async function publicSociety(word: string): Promise<PublicSociety | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc("society_public", { p_word: word });
    if (error || !data || typeof data !== "object" || !(data as any).slug) return null;
    const d = data as any;
    return { slug: String(d.slug), name: String(d.name || ""), logo: typeof d.logo === "string" ? d.logo : null };
  } catch { return null; }
}
