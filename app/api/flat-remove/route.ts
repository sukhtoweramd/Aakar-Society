// Main admin only: check, and then remove, flats that hold NO data (one flat, or every flat of one tower).
// "Holds no data" is decided by the database function flat_blockers (sql-security/15); the server calls it again right before deleting
// and refuses when even one flat holds anything. The towers table is not touched (remove an empty tower in FLAT SETUP → TOWERS).
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { isMainAdminUser } from "@/lib/mainAdmin";
import { logAccess } from "@/lib/backup";
import { MAX_REMOVE, canRemoveAll, removeText, type FlatBlocker } from "@/lib/flatRemove";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (!me.isCommittee) return NextResponse.json({ error: "Committee only." }, { status: 403 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables." }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "delete" ? "delete" : "check";
  const tower = String(body.tower ?? "").trim();
  const flat = String(body.flat ?? "").trim();
  try {
    if (!(await isMainAdminUser(admin, me.userId))) {
      await logAccess(admin, me.email, "refused_remove_flats", tower || flat);
      return NextResponse.json({ error: "Only the main admin login can remove flats." }, { status: 403 });
    }
    if (!tower && !flat) return NextResponse.json({ error: "Which tower or flat?" }, { status: 400 });
    const { data: all, error: fe } = await admin.from("flats").select("id, tower");
    if (fe) throw fe;
    const ids = (all || []).filter((f: any) => (flat ? String(f.id) === flat : String(f.tower ?? "").trim() === tower)).map((f: any) => String(f.id));
    if (!ids.length) return NextResponse.json({ error: "No such flat." }, { status: 404 });
    if (ids.length > MAX_REMOVE) return NextResponse.json({ error: `Too many flats (${ids.length}) for one go.` }, { status: 400 });

    const { data, error } = await admin.rpc("flat_blockers", { p_flats: ids });
    if (error) {
      if (/flat_blockers|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ error: "Run sql-security/15_FLAT_EMPTY_CHECK.sql in Supabase first." }, { status: 500 });
      throw error;
    }
    const rows = (data || []) as FlatBlocker[];
    if (mode === "check") return NextResponse.json({ ok: true, rows, text: removeText(rows) });

    if (!canRemoveAll(rows)) {
      await logAccess(admin, me.email, "refused_remove_flats", tower || flat, "flats hold data");
      return NextResponse.json({ error: removeText(rows), rows }, { status: 409 });
    }
    for (let i = 0; i < ids.length; i += 200) {
      const { error: de } = await admin.from("flats").delete().in("id", ids.slice(i, i + 200));
      if (de) throw new Error(`${i ? "Some flats were removed, then it stopped: " : "Nothing was removed: "}${de.message}`);
    }
    await logAccess(admin, me.email, "flats_removed", tower || flat, `${ids.length} flat(s)`);
    return NextResponse.json({ ok: true, removed: ids.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
