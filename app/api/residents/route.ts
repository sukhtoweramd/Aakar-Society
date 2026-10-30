// Committee-only: create / reset / remove flat (resident) logins, and tenant logins of rented flats (TENANT_LOGINS.sql).
// Uses the Supabase secret key on the server; it is never sent to the browser.
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { flatEmail, normaliseFlat, tenantEmail } from "@/lib/residents";

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

async function tenantUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all.filter((u) => (u.app_metadata as any)?.role === "tenant");
}
const BAN = "876000h"; // about 100 years: the login cannot be used; its records stay

/** Tenant login actions. The flat must exist and be marked rented; one active tenant login per flat. */
async function tenantAction(action: string, body: any, admin: SupabaseClient, me: { email: string; db: SupabaseClient }) {
  const flat = normaliseFlat(String(body.flat || ""));
  if (!flat) return NextResponse.json({ error: "Which flat?" }, { status: 400 });
  const { data: row, error: fe } = await me.db.from("flats").select("id, occupancy, tenant_name").eq("id", flat).maybeSingle();
  if (fe) throw fe;
  if (!row) return NextResponse.json({ error: "No such flat." }, { status: 404 });
  const users = await tenantUsers(admin);
  const user = users.find((u) => (u.app_metadata as any)?.tenant_flat === flat);
  const { data: rec } = await admin.from("flat_tenant_logins").select("*").eq("flat_id", flat).eq("active", true).maybeSingle();

  if (action === "tenant_create") {
    if ((row as any).occupancy !== "tenant") return NextResponse.json({ error: "Mark the flat as rented (with the tenant's name) first." }, { status: 400 });
    if (rec && user && rec.user_id === user.id) return NextResponse.json({ error: "This flat already has a tenant login. Use RESET or REVOKE." }, { status: 409 });
    if (user) { const { error } = await admin.auth.admin.deleteUser(user.id); if (error) throw error; }   // an old, revoked tenant login: removed, its records stay
    const password = newPassword();
    const { data: made, error } = await admin.auth.admin.createUser({
      email: tenantEmail(flat), password, email_confirm: true,
      app_metadata: { role: "tenant", tenant_flat: flat },
      user_metadata: { password_changed: false },
    });
    if (error || !made.user) throw error || new Error("Could not create the login.");
    await admin.from("flat_tenant_logins").update({ active: false, revoked_at: new Date().toISOString(), revoked_by: me.email, revoke_reason: "replaced" }).eq("flat_id", flat).eq("active", true);
    const { error: ie } = await admin.from("flat_tenant_logins").insert({ user_id: made.user.id, flat_id: flat, tenant_name: (row as any).tenant_name || null, created_by: me.email });
    if (ie) { await admin.auth.admin.deleteUser(made.user.id); throw ie; }
    return NextResponse.json({ ok: true, flat_id: flat, login: `${flat}-T`, password });
  }
  if (!user) return NextResponse.json({ error: "No tenant login exists for that flat." }, { status: 404 });
  if (action === "tenant_reset") {
    if (!rec || rec.user_id !== user.id) return NextResponse.json({ error: "The tenant login of this flat is switched off. Create a new one." }, { status: 409 });
    const password = newPassword();
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, user_metadata: { password_changed: false } });
    if (error) throw error;
    return NextResponse.json({ ok: true, flat_id: flat, login: `${flat}-T`, password });
  }
  if (action === "tenant_revoke") {
    const { error } = await admin.auth.admin.updateUserById(user.id, { ban_duration: BAN });
    if (error) throw error;
    await admin.from("flat_tenant_logins").update({ active: false, revoked_at: new Date().toISOString(), revoked_by: me.email, revoke_reason: String(body.reason || "revoked by the committee").slice(0, 200) }).eq("user_id", user.id).eq("active", true);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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
    const tenants = await tenantUsers(g.admin);
    const { data: recs } = await g.admin.from("flat_tenant_logins").select("user_id, flat_id, active, created_at, revoked_at, revoke_reason");
    return NextResponse.json({
      tenants: tenants.map((u) => { const r = (recs || []).find((x: any) => x.user_id === u.id); return {
        flat_id: (u.app_metadata as any).tenant_flat, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null,
        password_changed: !!(u.user_metadata as any)?.password_changed, active: !!r?.active, revoked_at: r?.revoked_at || null, revoke_reason: r?.revoke_reason || null }; }),
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
    if (action.startsWith("tenant_")) return await tenantAction(action, body, admin, me);
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
