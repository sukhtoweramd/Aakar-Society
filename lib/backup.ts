// Server-only helpers: full backup of the society's records, copies in R2, main admin, access log.
import { createHash, randomBytes } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2 } from "./r2Client";

/** Every table with society records, in the order they are restored (parents first). */
export const BACKUP_TABLES = ["flats", "billing_settings", "signatories", "events", "notices", "maintenance", "businesses",
  "members", "emergency_contacts", "vehicles", "flat_docs", "bills", "payments", "letters", "payment_reports"];
export const BACKUP_FOLDER = "backups";

export type Backup = {
  app: "aakar-society"; version: 1; created_at: string; created_by: string; kind: "manual" | "pre-restore";
  counts: Record<string, number>; skipped: string[];
  tables: Record<string, any[]>;
  logins: { email: string | undefined; role: string; flat_id: string | null; name: string }[]; // for reference only; not restored
};

const missingTable = (msg: string) => /does not exist|could not find the table|schema cache/i.test(msg);

export async function allUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}
export const isCommitteeUser = (u: User) => (u.app_metadata as any)?.role !== "resident";

/** The main admin: MAIN_ADMIN_EMAIL in Vercel if set, otherwise the oldest committee login (the society's own account). */
export function mainAdminId(committee: User[]): string | null {
  const env = (process.env.MAIN_ADMIN_EMAIL || "").trim().toLowerCase();
  if (env) { const u = committee.find((x) => (x.email || "").toLowerCase() === env); if (u) return u.id; }
  const sorted = [...committee].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return sorted[0]?.id || null;
}

export async function buildBackup(admin: SupabaseClient, by: string, kind: Backup["kind"]): Promise<Backup> {
  const tables: Record<string, any[]> = {}, counts: Record<string, number> = {}, skipped: string[] = [];
  for (const t of BACKUP_TABLES) {
    const rows: any[] = [];
    let failed = false;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select("*").range(from, from + 999);
      if (error) { if (missingTable(error.message)) { failed = true; break; } throw new Error(`${t}: ${error.message}`); }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (failed) { skipped.push(t); continue; }
    tables[t] = rows; counts[t] = rows.length;
  }
  const users = await allUsers(admin);
  const logins = users.map((u) => ({ email: u.email, role: (u.app_metadata as any)?.role || "committee", flat_id: (u.app_metadata as any)?.flat_id || null, name: (u.user_metadata as any)?.name || "" }));
  return { app: "aakar-society", version: 1, created_at: new Date().toISOString(), created_by: by, kind, counts, skipped, tables, logins };
}

/** Saves a copy in R2 under an unguessable name. Returns the key, or null when R2 is not set up. */
export async function storeBackup(b: Backup): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;
  const stamp = b.created_at.replace(/[:.]/g, "-");
  const key = `${BACKUP_FOLDER}/${b.kind === "pre-restore" ? "pre-restore" : "backup"}-${stamp}-${randomBytes(16).toString("hex")}.json`;
  await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: JSON.stringify(b), ContentType: "application/json" }));
  return key;
}

/** Public id for a stored copy. The real file name is never sent to browsers: the bucket serves files by name. */
export const backupId = (key: string) => createHash("sha256").update(key + (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest("hex").slice(0, 32);
export async function keyForId(id: string) {
  const all = await listBackups();
  return all?.find((b) => backupId(b.key) === id)?.key || null;
}

export async function listBackups() {
  const r2 = getR2();
  if (!r2) return null;
  const out: { key: string; kind: string; created: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const res = await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: `${BACKUP_FOLDER}/`, ContinuationToken: token }));
    for (const o of res.Contents || []) {
      if (!o.Key || !o.Key.endsWith(".json")) continue;
      out.push({ key: o.Key, kind: o.Key.includes("/pre-restore-") ? "pre-restore" : "manual", created: o.LastModified?.toISOString() || "", size: o.Size || 0 });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => b.created.localeCompare(a.created));
}

export async function readStoredBackup(key: string): Promise<Backup> {
  const r2 = getR2();
  if (!r2) throw new Error("File storage (R2) is not configured.");
  if (!new RegExp(`^${BACKUP_FOLDER}/[\\w.-]+\\.json$`).test(key)) throw new Error("Bad backup name.");
  const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
  return JSON.parse(await (res.Body as any).transformToString());
}

/** Records an action in access_log. Never fails the main action (table may not exist yet). */
export async function logAccess(admin: SupabaseClient, actor: string, action: string, target = "", details = "") {
  try { await admin.from("access_log").insert([{ actor, action, target, details }]); } catch { /* ignore */ }
}
