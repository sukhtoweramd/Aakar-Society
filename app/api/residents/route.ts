// Committee-only: create / reset / remove flat (resident) logins.
// Uses the Supabase secret key on the server; it is never sent to the browser.
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { flatEmail, normaliseFlat } from "@/lib/residents";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O/1/l/I
const newPassword = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function residentUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all.filter((u) => (u.app_metadata as any)?.role === "resident");
}

async function guard(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return { error: NextResponse.json({ error: "Please log in again." }, { status: 401 }) };
  if (!me.isCommittee) return { error: NextResponse.json({ error: "Committee only." }, { status: 403 }) };
  const admin = getAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables.", needsKey: true }, { status: 500 }) };
  return { me, admin };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    const users = await residentUsers(g.admin);
    return NextResponse.json({
      logins: users.map((u) => ({
        flat_id: (u.app_metadata as any).flat_id,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        password_changed: !!(u.user_metadata as any)?.password_changed,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me } = g;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  try {
    const existing = await residentUsers(admin);
    const byFlat = new Map(existing.map((u) => [String((u.app_metadata as any).flat_id), u]));

    if (action === "create") {
      const flats: string[] = (Array.isArray(body.flats) ? body.flats : []).map((f: string) => normaliseFlat(String(f))).filter(Boolean);
      // only flats that exist in the ledger
      const { data: rows, error } = await me.db.from("flats").select("id").in("id", flats);
      if (error) throw error;
      const valid = new Set((rows || []).map((r: any) => r.id));
      const created: { flat_id: string; password: string }[] = [];
      const skipped: string[] = [];
      for (const flat of flats) {
        if (!valid.has(flat) || byFlat.has(flat)) { skipped.push(flat); continue; }
        const password = newPassword();
        const { error: e } = await admin.auth.admin.createUser({
          email: flatEmail(flat), password, email_confirm: true,
          app_metadata: { role: "resident", flat_id: flat },
          user_metadata: { password_changed: false },
        });
        if (e) { skipped.push(`${flat} (${e.message})`); continue; }
        created.push({ flat_id: flat, password });
      }
      return NextResponse.json({ ok: true, created, skipped });
    }

    const flat = normaliseFlat(String(body.flat || ""));
    const user = flat ? byFlat.get(flat) : undefined;
    if (!flat || !user) return NextResponse.json({ error: "No login exists for that flat." }, { status: 404 });

    if (action === "reset") {
      const password = newPassword();
      const { error } = await admin.auth.admin.updateUserById(user.id, { password, user_metadata: { password_changed: false } });
      if (error) throw error;
      return NextResponse.json({ ok: true, flat_id: flat, password });
    }
    if (action === "remove") {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
