// Product owner page (/platform): list the societies (counts only) and create a new one. Server only.
// WHO MAY CALL: the login named by PLATFORM_OWNER_EMAIL, and only while it has no role and no society membership (lib/platformOwner.ts).
// This is the one route that looks across societies on purpose; it returns counts, names of societies and the owner's email, never resident data.
// A new society also gets its one-row settings (society_profile, app_settings, billing_settings with its own number prefixes).
import { NextRequest, NextResponse } from "next/server";
import { randomInt, randomUUID } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/serverAuth";
import { allUsers, logAccess } from "@/lib/backup";
import { membershipsOf } from "@/lib/mainAdmin";
import { addMembership, membershipRow } from "@/lib/memberships";
import { societyOwnerId } from "@/lib/societyOwner";
import { firstBillingRow, firstProfileRow, hasNoRole, isPlatformOwner, newSocietyInput, societyList, type SocietyRow } from "@/lib/platformOwner";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const newPassword = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function guard(req: NextRequest): Promise<{ admin: SupabaseClient; me: User } | { error: NextResponse }> {
  const admin = getAdminClient();
  if (!admin) return { error: fail("SUPABASE_SECRET_KEY is not set in Vercel environment variables.", 500) };
  if (!process.env.PLATFORM_OWNER_EMAIL) return { error: fail("PLATFORM_OWNER_EMAIL is not set in Vercel environment variables.", 500) };
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: fail("Please sign in again.", 401) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: fail("Please sign in again.", 401) };
  const { count, error: ce } = await admin.from("society_memberships").select("user_id", { count: "exact", head: true }).eq("user_id", data.user.id);
  if (ce) return { error: fail("Could not check the login.", 500) };
  if (!isPlatformOwner(data.user.email, process.env.PLATFORM_OWNER_EMAIL, count || 0) || !hasNoRole(data.user.app_metadata)) return { error: fail("Product owner only.", 403) };
  return { admin, me: data.user };
}

async function loadSocieties(admin: SupabaseClient): Promise<SocietyRow[]> {
  const { data, error } = await admin.from("societies").select("id, slug, name, status, created_at").order("created_at");
  if (error) throw error;
  return (data || []) as SocietyRow[];
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    const [societies, users, memberships] = await Promise.all([loadSocieties(g.admin), allUsers(g.admin), membershipsOf(g.admin)]);
    const flatCounts: Record<string, number> = {};
    for (const s of societies) {
      const { count, error } = await g.admin.from("flats").select("id", { count: "exact", head: true }).eq("society_id", s.id);
      if (error) throw error;
      flatCounts[s.id] = count || 0;
    }
    return NextResponse.json({ societies: societyList(societies, users, memberships, flatCounts) });
  } catch (e: any) {
    return fail(e.message || "Failed", 500);
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me } = g;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "create") {
      let input;
      try { input = newSocietyInput(body); } catch (e: any) { return fail(e.message, 400); }
      const { data: taken, error: te } = await admin.from("societies").select("id").eq("slug", input.word).maybeSingle();
      if (te) throw te;
      if (taken) return fail("That society word is already used.", 400);
      const id = randomUUID();
      const { error: se } = await admin.from("societies").insert([{ id, slug: input.word, name: input.name }]);
      if (se) throw se;
      const undo = async (userId?: string) => {   // leave nothing half made
        if (userId) await admin.auth.admin.deleteUser(userId);
        await admin.from("billing_settings").delete().eq("society_id", id);
        await admin.from("app_settings").delete().eq("society_id", id);
        await admin.from("society_profile").delete().eq("society_id", id);
        await admin.from("societies").delete().eq("id", id);
      };
      const password = newPassword();
      const { data: made, error: ue } = await admin.auth.admin.createUser({
        email: input.ownerEmail, password, email_confirm: true,
        app_metadata: { role: "committee" }, user_metadata: { name: "", added_by: me.email, password_changed: false },
      });
      if (ue || !made?.user) {
        await undo();
        return fail(ue && /already/i.test(ue.message) ? "A login with this email already exists." : ue?.message || "Could not create the owner login.", 400);
      }
      try {
        await addMembership(admin, membershipRow(made.user.id, id, "society_admin"));
        const { error: pe } = await admin.from("society_profile").insert([firstProfileRow(id, input.name)]);
        if (pe) throw pe;
        // the one-row settings of the society (billing numbers with its OWN prefixes, screen settings); without them BILLING shows "needs BILLING.sql"
        const { error: ae } = await admin.from("app_settings").insert([{ society_id: id, id: 1 }]);
        if (ae) throw ae;
        const { error: be } = await admin.from("billing_settings").insert([firstBillingRow(id, input.word)]);
        if (be) throw be;
      } catch (e: any) {
        await undo(made.user.id);
        return fail("Could not set up the society: " + (e?.message || "unknown error"), 500);
      }
      await logAccess(admin, me.email || "", "society_created", input.word, `owner ${input.ownerEmail}`, id);
      return NextResponse.json({ ok: true, id, word: input.word, ownerEmail: input.ownerEmail, password });
    }
    if (body.action === "reset_owner") {
      const id = String(body.id || "");
      const [societies, users, memberships] = await Promise.all([loadSocieties(admin), allUsers(admin), membershipsOf(admin)]);
      const s = societies.find((x) => x.id === id);
      if (!s) return fail("Society not found.", 404);
      const ownerId = societyOwnerId(users, memberships, s.id, null);
      const owner = users.find((u) => u.id === ownerId);
      if (!owner) return fail("This society has no owner login.", 404);
      const password = newPassword();
      const { error } = await admin.auth.admin.updateUserById(owner.id, { password, user_metadata: { ...(owner.user_metadata || {}), password_changed: false } });
      if (error) throw error;
      await logAccess(admin, me.email || "", "owner_password_reset", owner.email || owner.id, "by product owner", s.id);
      return NextResponse.json({ ok: true, email: owner.email, password });
    }
    return fail("Unknown action", 400);
  } catch (e: any) {
    return fail(e.message || "Failed", 500);
  }
}
