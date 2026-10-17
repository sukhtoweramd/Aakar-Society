// Backup & restore of all society records.
// GET  → list of stored backups (committee), or ?key=… to download one, ?log=1 for the access log.
// POST {action:"backup"}            → make a backup now: saved in R2 and returned for download (committee).
// POST {action:"restore", backup|key} → replace all records with the backup (MAIN ADMIN only); a backup of the
//                                     current records is taken first.
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { allUsers, backupId, keyForId, buildBackup, isCommitteeUser, listBackups, logAccess, mainAdminId, readStoredBackup, storeBackup, type Backup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { admin, me } = g;
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const key = await keyForId(id);
      if (!key) return NextResponse.json({ error: "Backup not found." }, { status: 404 });
      const b = await readStoredBackup(key);
      await logAccess(admin, me.email, "backup_downloaded", `backup of ${b.created_at}`);
      return NextResponse.json({ backup: b });
    }
    if (req.nextUrl.searchParams.get("log")) {
      const { data, error } = await admin.from("access_log").select("*").order("at", { ascending: false }).limit(30);
      return NextResponse.json({ log: error ? null : data, needsSql: !!error });
    }
    const committee = (await allUsers(admin)).filter(isCommitteeUser);
    const main = committee.find((u) => u.id === mainAdminId(committee));
    const backups = await listBackups();
    return NextResponse.json({ backups: backups && backups.map((b) => ({ id: backupId(b.key), kind: b.kind, created: b.created, size: b.size })), r2: backups !== null, isMainAdmin: main?.id === me.userId, mainAdminEmail: main?.email || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me } = g;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "backup") {
      const b = await buildBackup(admin, me.email, "manual");
      const key = await storeBackup(b);
      await logAccess(admin, me.email, "backup", key ? "saved in file storage + downloaded" : "downloaded only (R2 not set up)", Object.entries(b.counts).map(([t, n]) => `${t} ${n}`).join(", "));
      return NextResponse.json({ backup: b, stored: !!key });
    }
    if (body.action === "restore") {
      const committee = (await allUsers(admin)).filter(isCommitteeUser);
      if (mainAdminId(committee) !== me.userId) return NextResponse.json({ error: "Only the main admin login can restore a backup." }, { status: 403 });
      let b: Backup = body.backup;
      if (body.id) { const key = await keyForId(String(body.id)); if (!key) return NextResponse.json({ error: "Backup not found." }, { status: 404 }); b = await readStoredBackup(key); }
      if (!b || b.app !== "aakar-society" || typeof b.tables !== "object" || !Array.isArray(b.tables.flats) || !b.tables.flats.length)
        return NextResponse.json({ error: "This is not a valid Aakar Society backup file." }, { status: 400 });
      // Safety copy of what is there now, so a wrong restore can be undone.
      const before = await buildBackup(admin, me.email, "pre-restore");
      const safetyKey = await storeBackup(before);
      if (!safetyKey) return NextResponse.json({ error: "Restore needs file storage (R2) to keep a safety copy first. R2 is not configured." }, { status: 500 });
      const { data, error } = await admin.rpc("restore_society_backup", { p: b });
      if (error) {
        const needSql = /function .*restore_society_backup|could not find the function/i.test(error.message);
        await logAccess(admin, me.email, "restore_failed", `backup of ${b.created_at}`, error.message);
        return NextResponse.json({ error: needSql ? "Run BACKUP_RESTORE.sql in Supabase first." : `Restore stopped; nothing was changed. ${error.message}` }, { status: needSql ? 400 : 500 });
      }
      await logAccess(admin, me.email, "restore", `backup of ${b.created_at}`, "safety copy of earlier records saved");
      return NextResponse.json({ ok: true, restored: data });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
