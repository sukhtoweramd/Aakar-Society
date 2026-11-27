// Committee (admin) logins: list, add by email, reset password, remove.
// Only committee members can call this; add / reset / link / remove only the main admin login (audit H2, PR-14). Uses the Supabase secret key on the server.
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { normaliseFlat, isFlatEmail, rulesFor } from "@/lib/residents";
import { logAccess } from "@/lib/backup";
import { societyCommittee } from "@/lib/mainAdmin";
import { addMembership, membershipRow, societyOfCaller, societyWordOf } from "@/lib/memberships";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const newPassword = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The server key skips the database wall, so every list below is only the caller's own society (lib/societyOwner.ts).
async function committeeUsers(admin: SupabaseClient, userId: string): Promise<{ users: User[]; main: string | null }> {
  const { committee, ownerId } = await societyCommittee(admin, await societyOfCaller(admin, userId));
  return { users: committee, main: ownerId };
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
    const { users, main } = await committeeUsers(g.admin, g.me.userId);
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
    const { users: members, main } = await committeeUsers(admin, me.userId);
    const society = await societyOfCaller(admin, me.userId);
    // Audit H2: adding logins, resetting passwords and linking flats is for the main admin login only,
    // otherwise any committee login could reset the main admin's password and take it over.
    const isMain = main === me.userId;
    // PR-14: removing a committee login (one, or all linked to a flat) is main admin only too.
    if (["add", "reset", "link", "remove", "revoke_flat"].includes(body.action) && !isMain) {
      await logAccess(admin, me.email, "refused_" + body.action, String(body.email || body.id || ""), "", society);
      return NextResponse.json({ error: "Only the main admin login can do this." }, { status: 403 });
    }
    // Optional link to the committee member's own flat ("A301"); "" / null = not linked
    const rawFlat = String(body.flat_id ?? "").trim();
    const flatId = rawFlat ? normaliseFlat(rawFlat, rulesFor(await societyWordOf(admin, society))) : null;
    if (rawFlat && !flatId) return NextResponse.json({ error: `"${rawFlat}" is not a flat number like A-301.` }, { status: 400 });
    if (body.action === "add") {
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim().slice(0, 80);
      if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      if (isFlatEmail(email)) return NextResponse.json({ error: "That is a flat login address." }, { status: 400 });
      const password = newPassword();
      const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: "committee", flat_id: flatId }, user_metadata: { name, added_by: me.email, password_changed: false } });
      if (error || !made?.user) return NextResponse.json({ error: error && /already/i.test(error.message) ? "A login with this email already exists." : error?.message || "Could not create the login." }, { status: 400 });
      try {   // the new login joins the society of the main admin who made it; if that fails the login is removed again
        await addMembership(admin, membershipRow(made.user.id, society, "committee", flatId));
      } catch (e: any) {
        await admin.auth.admin.deleteUser(made.user.id);
        return NextResponse.json({ error: "Could not add the login to the society: " + (e?.message || "unknown error") }, { status: 500 });
      }
      await logAccess(admin, me.email, "login_added", email, flatId ? `own flat ${flatId}` : "", society);
      return NextResponse.json({ ok: true, email, password });
    }
    // A flat is no longer on the committee: remove every committee login linked to it.
    if (body.action === "revoke_flat") {
      if (!flatId) return NextResponse.json({ error: "Flat missing." }, { status: 400 });
      const linked = members.filter((m) => (m.app_metadata as any)?.flat_id === flatId);
      const removed: string[] = [], kept: string[] = [];
      for (const m of linked) {
        if (m.id === main || m.id === me.userId) { kept.push(`${m.email} (${m.id === main ? "main admin" : "your own login"})`); continue; }
        const { error } = await admin.auth.admin.deleteUser(m.id);
        if (error) throw error;
        removed.push(m.email || m.id);
        await logAccess(admin, me.email, "login_removed", m.email || m.id, `left the committee (flat ${flatId})`, society);
      }
      return NextResponse.json({ ok: true, removed, kept });
    }
    const target = members.find((m) => m.id === body.id);
    if (!target) return NextResponse.json({ error: "Committee login not found." }, { status: 404 });
    if (body.action === "reset") {
      const password = newPassword();
      // first login after a reset must choose a new password (31 Oct 2026)
      const { error } = await admin.auth.admin.updateUserById(target.id, { password, user_metadata: { ...(target.user_metadata || {}), password_changed: false } });
      if (error) throw error;
      await logAccess(admin, me.email, "password_reset", target.email || target.id, "", society);
      return NextResponse.json({ ok: true, email: target.email, password });
    }
    if (body.action === "link") {
      const { error } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { role: "committee", flat_id: flatId } });
      if (error) throw error;
      const { error: me2 } = await admin.from("society_memberships").update({ flat_id: flatId }).eq("user_id", target.id);   // keep the membership's flat link equal
      if (me2) throw me2;
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove") {
      if (target.id === me.userId) return NextResponse.json({ error: "You cannot remove your own login." }, { status: 400 });
      if (members.length <= 1) return NextResponse.json({ error: "At least one committee login must remain." }, { status: 400 });
      if (target.id === main) return NextResponse.json({ error: "The main admin login cannot be removed." }, { status: 400 });
      const { error } = await admin.auth.admin.deleteUser(target.id);
      if (error) throw error;
      await logAccess(admin, me.email, "login_removed", target.email || target.id, String(body.reason || "removed from ADMIN"), society);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
