// Backup & restore of all society records.
// GET  → list of stored backups (committee), or ?id=… to download one (MAIN ADMIN only), ?log=1 for the access log.
// POST {action:"backup"}            → make a backup now: saved in R2 and returned for download (MAIN ADMIN only).
// POST {action:"restore", backup|key} → replace all records with the backup (MAIN ADMIN only); a backup of the
//                                     current records is taken first.
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { backupSocietyError } from "@/lib/backupScope";
import { societyOfCaller } from "@/lib/memberships";
import { isMainAdminUser, societyCommittee } from "@/lib/mainAdmin";
import { backupId, keyForId, buildBackup, listBackups, logAccess, readStoredBackup, storeBackup, type Backup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return { error: NextResponse.json({ error: "Please log in again." }, { status: 401 }) };
  if (!me.isCommittee) return { error: NextResponse.json({ error: "Committee only." }, { status: 403 }) };
  const admin = getAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables." }, { status: 500 }) };
  return { me, admin, society: await societyOfCaller(admin, me.userId) }; // every read and write below names this society (the server key skips the database wall)
}

// A backup holds every resident's records, so downloading one (or making one that is handed to the browser) is
// for the main admin login only (audit PR-5). Other committee logins can still see the list and the access log.
async function isMainAdminLogin(admin: any, userId: string) {
  return isMainAdminUser(admin, userId);   // the owner of the caller's own society (lib/societyOwner.ts)
}
const MAIN_ADMIN_ONLY = () => NextResponse.json({ error: "Only the main admin login can download a backup." }, { status: 403 });

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me, society } = g;
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      if (!(await isMainAdminLogin(admin, me.userId))) return MAIN_ADMIN_ONLY();
      const key = await keyForId(id, society);
      if (!key) return NextResponse.json({ error: "Backup not found." }, { status: 404 });
      const b = await readStoredBackup(key, society);
      await logAccess(admin, me.email, "backup_downloaded", `backup of ${b.created_at}`, "", society);
      return NextResponse.json({ backup: b });
    }
    if (req.nextUrl.searchParams.get("log")) {
      const { data, error } = await admin.from("access_log").select("*").eq("society_id", society).order("at", { ascending: false }).limit(30);
      return NextResponse.json({ log: error ? null : data, needsSql: !!error });
    }
    const { committee, ownerId } = await societyCommittee(admin, society);
    const main = committee.find((u) => u.id === ownerId);
    const backups = await listBackups(society);
    return NextResponse.json({ backups: backups && backups.map((b) => ({ id: backupId(b.key), kind: b.kind, created: b.created, size: b.size })), r2: backups !== null, isMainAdmin: main?.id === me.userId, mainAdminEmail: main?.email || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me, society } = g;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "backup") {
      if (!(await isMainAdminLogin(admin, me.userId))) return MAIN_ADMIN_ONLY();
      const b = await buildBackup(admin, me.email, "manual", society);
      const key = await storeBackup(b, society);
      await logAccess(admin, me.email, "backup", key ? "saved in file storage + downloaded" : "downloaded only (R2 not set up)", Object.entries(b.counts).map(([t, n]) => `${t} ${n}`).join(", "), society);
      return NextResponse.json({ backup: b, stored: !!key });
    }
    if (body.action === "restore") {
      if (!(await isMainAdminLogin(admin, me.userId))) return NextResponse.json({ error: "Only the main admin login can restore a backup." }, { status: 403 });
      let b: Backup = body.backup;
      if (body.id) { const key = await keyForId(String(body.id), society); if (!key) return NextResponse.json({ error: "Backup not found." }, { status: 404 }); b = await readStoredBackup(key, society); }
      if (!b || b.app !== "aakar-society" || typeof b.tables !== "object" || !Array.isArray(b.tables.flats) || !b.tables.flats.length)
        return NextResponse.json({ error: "This is not a valid society backup file." }, { status: 400 });
      // A file may only go back into the society it was made from (a file from before step 4d has no society id: it is the first society's).
      const wrong = backupSocietyError(b, society);
      if (wrong) return NextResponse.json({ error: wrong }, { status: 400 });
      // Safety copy of what is there now, so a wrong restore can be undone.
      const before = await buildBackup(admin, me.email, "pre-restore", society);
      const safetyKey = await storeBackup(before, society);
      if (!safetyKey) return NextResponse.json({ error: "Restore needs file storage (R2) to keep a safety copy first. R2 is not configured." }, { status: 500 });
      const { data, error } = await admin.rpc("restore_society_backup", { p: b, p_society: society });
      if (error) {
        const needSql = /function .*restore_society_backup|could not find the function/i.test(error.message); // also when multitenant/MT_09 is not run yet (the society argument)
        await logAccess(admin, me.email, "restore_failed", `backup of ${b.created_at}`, error.message, society);
        return NextResponse.json({ error: needSql ? "Run BACKUP_RESTORE.sql and multitenant/MT_09 in Supabase first." : `Restore stopped; nothing was changed. ${error.message}` }, { status: needSql ? 400 : 500 });
      }
      await logAccess(admin, me.email, "restore", `backup of ${b.created_at}`, "safety copy of earlier records saved", society);
      return NextResponse.json({ ok: true, restored: data });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
