// Main admin only (PR-15): remove EVERY family member, vehicle and emergency contact of a flat in one go.
// Used when a flat changes between owner-occupied and rented, or the tenant moves out. Other committee logins can
// still remove people one at a time with the ✕ in the family list. The server key is never sent to the browser.
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { normaliseFlat } from "@/lib/residents";
import { isMainAdminUser } from "@/lib/mainAdmin";
import { logAccess } from "@/lib/backup";

export const dynamic = "force-dynamic";
const missingTable = (msg: string) => /does not exist|could not find the table|schema cache/i.test(msg);

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (!me.isCommittee) return NextResponse.json({ error: "Committee only." }, { status: 403 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables." }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const flat = normaliseFlat(String(body.flat || ""));
  if (!flat) return NextResponse.json({ error: "Which flat?" }, { status: 400 });
  try {
    if (!(await isMainAdminUser(admin, me.userId))) {
      await logAccess(admin, me.email, "refused_clear_family", flat);
      return NextResponse.json({ error: "Only the main admin login can remove everyone at once. Remove people one by one with ✕, or ask the main admin." }, { status: 403 });
    }
    const { data: exists, error: fe } = await admin.from("flats").select("id").eq("id", flat).maybeSingle();
    if (fe) throw fe;
    if (!exists) return NextResponse.json({ error: "No such flat." }, { status: 404 });
    for (const t of ["vehicles", "emergency_contacts"]) {
      const { error } = await admin.from(t).delete().eq("flat_id", flat);
      if (error && !missingTable(error.message)) throw error;
    }
    const { data, error } = await admin.from("members").delete().eq("flat_id", flat).select("id");
    if (error) throw error;
    await logAccess(admin, me.email, "family_cleared", flat, `${data?.length || 0} member(s) removed`);
    return NextResponse.json({ ok: true, removed: data?.length || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
