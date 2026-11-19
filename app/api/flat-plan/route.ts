// Main admin only: create the flats of a society that has none yet (flat generator). The server builds the list itself from the
// tower numbers (lib/flatPlan.ts), checks the towers exist, refuses when ANY flat already exists, and undoes its own insert if one fails.
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { isMainAdminUser } from "@/lib/mainAdmin";
import { logAccess } from "@/lib/backup";
import { buildFlatPlan, planError, type TowerPlan } from "@/lib/flatPlan";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (!me.isCommittee) return NextResponse.json({ error: "Committee only." }, { status: 403 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables." }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const towers: TowerPlan[] = Array.isArray(body.towers) ? body.towers.map((t: any) => ({
    code: String(t?.code ?? "").trim().toUpperCase(), floors: Number(t?.floors), perFloor: Number(t?.perFloor),
    terrace: t?.terrace === true, maint: Number(t?.maint), maintTerrace: Number(t?.maintTerrace ?? 0),
  })) : [];
  try {
    if (!(await isMainAdminUser(admin, me.userId))) {
      await logAccess(admin, me.email, "refused_create_flats", "");
      return NextResponse.json({ error: "Only the main admin login can create flats." }, { status: 403 });
    }
    const bad = planError(towers);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const { count, error: ce } = await admin.from("flats").select("id", { count: "exact", head: true });
    if (ce) throw ce;
    if ((count || 0) > 0) return NextResponse.json({ error: `This society already has ${count} flats, so none are created.` }, { status: 409 });
    const { data: rows, error: te } = await admin.from("towers").select("code, active");
    if (te) throw te;
    const known = new Set((rows || []).filter((r: any) => r.active !== false).map((r: any) => String(r.code).trim()));
    const missing = towers.map((t) => t.code).filter((c) => !known.has(c));
    if (missing.length) return NextResponse.json({ error: `Add tower ${missing.join(", ")} in FLAT SETUP → TOWERS first.` }, { status: 400 });

    const plan = buildFlatPlan(towers);
    for (let i = 0; i < plan.length; i += 200) {
      const { error } = await admin.from("flats").insert(plan.slice(i, i + 200));
      if (error) {
        // the table was empty before, so removing the planned ids only removes what this call added
        await admin.from("flats").delete().in("id", plan.map((p) => p.id));
        throw new Error(`Nothing was created: ${error.message}`);
      }
    }
    await logAccess(admin, me.email, "flats_created", "", `${plan.length} flats in ${towers.length} tower(s)`);
    return NextResponse.json({ ok: true, created: plan.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
