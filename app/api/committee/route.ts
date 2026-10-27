// Committee (admin) logins: list, add by email, reset password, remove.
// Only committee members can call this; add / reset / link only the main admin login (audit H2). Uses the Supabase secret key on the server.
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { normaliseFlat } from "@/lib/residents";
import { logAccess, mainAdminId } from "@/lib/backup";
import { isCommitteeMeta } from "@/lib/roles";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const newPassword = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function committeeUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all.filter((u) => isCommitteeMeta(u.app_metadata));
}

async function guard(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return { error: NextResponse.json({ error: "Please log in again." }, { status: 401 }) };
  if (!me.isCommittee) return { error: NextResponse.json({ error: "Committee only." }, { status: 403 }) };
  const admin = getAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables." }, { status: 500 }) };
  return { me, admin };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    const users = await committeeUsers(g.admin);
    const main = mainAdminId(users);
    return NextResponse.json({
      members: users
        .map((u) => ({ id: u.id, email: u.email, name: (u.user_metadata as any)?.name || "", flat_id: (u.app_metadata as any)?.flat_id || null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null, self: u.id === g.me.userId, main: u.id === main }))
        .sort((a, b) => (a.email || "").localeCompare(b.email || "")),
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
  try {
    const members = await committeeUsers(admin);
    // Audit H2: adding logins, resetting passwords and linking flats is for the main admin login only,
    // otherwise any committee login could reset the main admin's password and take it over.
    const isMain = mainAdminId(members) === me.userId;
    if (["add", "reset", "link"].includes(body.action) && !isMain) {
      await logAccess(admin, me.email, "refused_" + body.action, String(body.email || body.id || ""));
      return NextResponse.json({ error: "Only the main admin login can do this." }, { status: 403 });
    }
    // Optional link to the committee member's own flat ("A301"); "" / null = not linked
    const rawFlat = String(body.flat_id ?? "").trim();
    const flatId = rawFlat ? normaliseFlat(rawFlat) : null;
    if (rawFlat && !flatId) return NextResponse.json({ error: `"${rawFlat}" is not a flat number like A-301.` }, { status: 400 });
    if (body.action === "add") {
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim().slice(0, 80);
      if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      if (email.endsWith("@flats.aakarsociety.app")) return NextResponse.json({ error: "That is a flat login address." }, { status: 400 });
      const password = newPassword();
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: "committee", flat_id: flatId }, user_metadata: { name, added_by: me.email } });
      if (error) return NextResponse.json({ error: /already/i.test(error.message) ? "A login with this email already exists." : error.message }, { status: 400 });
      await logAccess(admin, me.email, "login_added", email, flatId ? `own flat ${flatId}` : "");
      return NextResponse.json({ ok: true, email, password });
    }
    // A flat is no longer on the committee: remove every committee login linked to it.
    if (body.action === "revoke_flat") {
      if (!flatId) return NextResponse.json({ error: "Flat missing." }, { status: 400 });
      const main = mainAdminId(members);
      const linked = members.filter((m) => (m.app_metadata as any)?.flat_id === flatId);
      const removed: string[] = [], kept: string[] = [];
      for (const m of linked) {
        if (m.id === main || m.id === me.userId) { kept.push(`${m.email} (${m.id === main ? "main admin" : "your own login"})`); continue; }
        const { error } = await admin.auth.admin.deleteUser(m.id);
        if (error) throw error;
        removed.push(m.email || m.id);
        await logAccess(admin, me.email, "login_removed", m.email || m.id, `left the committee (flat ${flatId})`);
      }
      return NextResponse.json({ ok: true, removed, kept });
    }
    const target = members.find((m) => m.id === body.id);
    if (!target) return NextResponse.json({ error: "Committee login not found." }, { status: 404 });
    if (body.action === "reset") {
      const password = newPassword();
      const { error } = await admin.auth.admin.updateUserById(target.id, { password });
      if (error) throw error;
      await logAccess(admin, me.email, "password_reset", target.email || target.id);
      return NextResponse.json({ ok: true, email: target.email, password });
    }
    if (body.action === "link") {
      const { error } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { role: "committee", flat_id: flatId } });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove") {
      if (target.id === me.userId) return NextResponse.json({ error: "You cannot remove your own login." }, { status: 400 });
      if (members.length <= 1) return NextResponse.json({ error: "At least one committee login must remain." }, { status: 400 });
      if (target.id === mainAdminId(members)) return NextResponse.json({ error: "The main admin login cannot be removed." }, { status: 400 });
      const { error } = await admin.auth.admin.deleteUser(target.id);
      if (error) throw error;
      await logAccess(admin, me.email, "login_removed", target.email || target.id, String(body.reason || "removed from ADMIN"));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
