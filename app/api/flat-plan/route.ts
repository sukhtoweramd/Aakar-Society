// Main admin only: create the flats of towers that have none yet (flat generator; a society's first towers, or a new tower later). The server builds
// the list itself from the tower numbers (lib/flatPlan.ts), checks the towers exist, refuses when a chosen tower already has flats or a planned
// flat number already exists anywhere, and undoes its own insert if one fails.
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { isMainAdminUser } from "@/lib/mainAdmin";
import { logAccess } from "@/lib/backup";
import { societyOfCaller } from "@/lib/memberships";
import { buildFlatPlan, planClashes, planError, planWarnings, type TowerPlan } from "@/lib/flatPlan";

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
    ...(Array.isArray(t?.layout) ? { layout: t.layout.map((r: any) => ({ floor: Number(r?.floor), numbers: Array.isArray(r?.numbers) ? r.numbers.map((n: any) => String(n).trim().toUpperCase()) : [] })) } : {}),
  })) : [];
  try {
    const society = await societyOfCaller(admin, me.userId);   // the server key skips the database wall: every query names the society
    if (!(await isMainAdminUser(admin, me.userId))) {
      await logAccess(admin, me.email, "refused_create_flats", "", "", society);
      return NextResponse.json({ error: "Only the main admin login can create flats." }, { status: 403 });
    }
    const bad = planError(towers);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const warn = planWarnings(towers);
    if (warn.length) return NextResponse.json({ error: warn[0] }, { status: 400 });
    const { data: have, error: ce } = await admin.from("flats").select("id, tower").eq("society_id", society);
    if (ce) throw ce;
    const used = new Set(towers.map((t) => t.code));
    const taken = Array.from(new Set((have || []).map((f: any) => String(f.tower ?? "").trim()).filter((c) => used.has(c))));
    if (taken.length) return NextResponse.json({ error: `Tower ${taken.join(", ")} already has flats, so none are created.` }, { status: 409 });
    const { data: rows, error: te } = await admin.from("towers").select("code, active").eq("society_id", society);
    if (te) throw te;
    const known = new Set((rows || []).filter((r: any) => r.active !== false).map((r: any) => String(r.code).trim()));
    const missing = towers.map((t) => t.code).filter((c) => !known.has(c));
    if (missing.length) return NextResponse.json({ error: `Add tower ${missing.join(", ")} in FLAT SETUP → TOWERS first.` }, { status: 400 });

    const plan = buildFlatPlan(towers);
    const clash = planClashes(plan, (have || []).map((f: any) => String(f.id)));
    if (clash.length) return NextResponse.json({ error: `Flat number ${clash.slice(0, 5).join(", ")}${clash.length > 5 ? " …" : ""} already exists, so none are created.` }, { status: 409 });
    for (let i = 0; i < plan.length; i += 200) {
      const { error } = await admin.from("flats").insert(plan.slice(i, i + 200).map((p) => ({ ...p, society_id: society })));
      if (error) {
        // none of these ids existed before (checked above), so removing them only removes what this call added
        await admin.from("flats").delete().eq("society_id", society).in("id", plan.map((p) => p.id));
        throw new Error(`Nothing was created: ${error.message}`);
      }
    }
    await logAccess(admin, me.email, "flats_created", "", `${plan.length} flats in ${towers.length} tower(s)`, society);
    return NextResponse.json({ ok: true, created: plan.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
