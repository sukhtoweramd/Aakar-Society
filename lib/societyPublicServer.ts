// Reads society_public(word) on the server with the PUBLISHABLE key only (the same call the login page makes before login): name and logo of an
// active society. No server key here on purpose. Used by the installed-app manifest, icon and page title for a society's own address.
// Three answers: found (society), none (the lookup worked and there is no active society with that word), failed (could not ask: retried once).
// A failure must never turn into the first society's name or icon: callers use the word itself instead (see lib/societyPwa.ts `fallbackSociety`).
import { createClient } from "@supabase/supabase-js";
import type { PublicSociety } from "./societyPwa";

export type Lookup = { society: PublicSociety | null; failed: boolean };

async function once(word: string): Promise<Lookup> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { society: null, failed: true };
  try {
    const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc("society_public", { p_word: word });
    if (error) return { society: null, failed: true };
    if (!data || typeof data !== "object" || !(data as any).slug) return { society: null, failed: false };
    const d = data as any;
    return { society: { slug: String(d.slug), name: String(d.name || ""), logo: typeof d.logo === "string" ? d.logo : null }, failed: false };
  } catch { return { society: null, failed: true }; }
}

export async function lookupSociety(word: string): Promise<Lookup> {
  const first = await once(word);
  return first.failed ? once(word) : first;
}
