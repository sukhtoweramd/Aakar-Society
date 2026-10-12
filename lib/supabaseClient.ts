import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";

// Browser client. The logged-in user's session is attached automatically,
// so Row Level Security in Supabase decides what they can read/write.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
