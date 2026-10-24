// Files in Cloudflare R2: notice attachments, flat documents, society vault, floor plans, minutes, AMC, events.
// Every request needs a login. Files are shown through short-lived signed links (lib/r2Access.ts), never the
// bucket's public address, so a forwarded link stops working after a few minutes.
// GET ?folder=…  → list a folder (url = 10-minute signed link)
// POST (form)    → upload; returns { key, url: the form stored in rows, view: signed link }
// DELETE         → { key } or { url } (old public address or key)
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getAuthedClient } from "@/lib/serverAuth";
import { getR2, MAX_FILE_BYTES, ALLOWED_EXT } from "@/lib/r2Client";
import { folderAccess, parseFileRef, safeFolder } from "@/lib/r2Keys";
import { publicBases, signKey, SHOW_SECONDS } from "@/lib/r2Access";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Please log in again." }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "You are not allowed to change this." }, { status: 403 });
type Me = { isCommittee: boolean; flatId: string | null; db: any };
/** Role of this flat in an event's organising team (Convenor / Treasurer / Member), or null */
async function eventRole(me: Me, folder: string): Promise<string | null> {
  const id = folder.split("/")[1];
  if (!me.flatId || !id) return null;
  const { data, error } = await me.db.rpc("my_event_role", { p_event: id });
  return error ? null : (data as string | null);
}
// Listing a whole folder: committee; residents for society folders and their own flat; the event team for eventdocs.
// (Single files attached to a meeting or event entry are opened through /api/file/link, which checks that row.)
async function canRead(me: Me, folder: string) {
  const a = folderAccess(folder, me);
  if (a === "yes") return true;
  if (a === "team") return !!(await eventRole(me, folder));
  return false;
}
async function canWrite(me: Me, folder: string) {
  if (me.isCommittee || (!!me.flatId && folder === `flats/${me.flatId}`)) return true;
  if (folder.startsWith("events/")) return (await eventRole(me, folder)) === "Convenor";
  if (folder.startsWith("eventdocs/")) return ["Convenor", "Treasurer"].includes((await eventRole(me, folder)) || "");
  return false;
}

export async function GET(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return unauthorized();
  const r2 = getR2();
  if (!r2) return NextResponse.json({ files: [], warning: "File storage (R2) is not configured." });
  const folder = safeFolder(req.nextUrl.searchParams.get("folder") || "");
  if (!folder) return NextResponse.json({ error: "Bad folder" }, { status: 400 });
  if (!(await canRead(me, folder))) return forbidden();
  try {
    const files: any[] = [];
    let token: string | undefined;
    do {
      const res = await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: `${folder}/`, ContinuationToken: token }));
      for (const o of res.Contents || []) {
        if (!o.Key || o.Key.endsWith("/")) continue;
        const rest = o.Key.slice(folder.length + 1);
        if (rest.includes("/")) continue; // only direct children
        files.push({ key: o.Key, name: rest.replace(/^\d{10,}_/, ""), url: "", size: o.Size || 0, uploaded: o.LastModified?.toISOString() || null });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    files.sort((a, b) => (b.uploaded || "").localeCompare(a.uploaded || ""));
    for (const f of files) f.url = (await signKey(f.key, SHOW_SECONDS)) || "";
    return NextResponse.json({ files });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return unauthorized();
  const r2 = getR2();
  if (!r2) return NextResponse.json({ error: "File storage (R2) is not configured in Vercel environment variables." }, { status: 500 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const folder = safeFolder(String(form.get("folder") || "notices"));
    const slot = String(form.get("slot") || "").replace(/[^a-z0-9-]/g, "");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!folder) return NextResponse.json({ error: "Bad folder" }, { status: 400 });
    if (!(await canWrite(me, folder))) return forbidden();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT[ext]) return NextResponse.json({ error: `Allowed files: ${Object.keys(ALLOWED_EXT).join(", ").toUpperCase()}` }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 400 });

    const safeName = file.name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "file";
    // Vault slots use a fixed name so a new upload replaces the old document.
    const key = folder === "vault" && slot ? `vault/${slot}.${ext}` : `${folder}/${Date.now()}_${safeName}.${ext}`;
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type || ALLOWED_EXT[ext] }));
    // url = what screens save in their rows: same form as before (public address) while one is set, so rows stay
    // uniform; the address is only read back as a name for the key. view = a signed link to show it now.
    return NextResponse.json({ ok: true, key, url: r2.publicUrl ? `${r2.publicUrl}/${key}` : key, view: await signKey(key, SHOW_SECONDS) });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return unauthorized();
  const r2 = getR2();
  if (!r2) return NextResponse.json({ ok: true });
  const { url, key: rawKey } = await req.json().catch(() => ({}));
  const ref = parseFileRef(typeof rawKey === "string" && rawKey ? rawKey : typeof url === "string" ? url : "", publicBases());
  if (!ref || ref.kind !== "r2") return NextResponse.json({ ok: true });   // nothing of ours to delete
  const { key, folder } = ref;
  if (!(await canWrite(me, folder))) return forbidden();
  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
