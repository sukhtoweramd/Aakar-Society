// Files in Cloudflare R2: notice attachments, flat documents, society vault, floor plans.
// Every request needs a logged-in committee member.
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getAuthedClient } from "@/lib/serverAuth";
import { getR2, MAX_FILE_BYTES, ALLOWED_EXT } from "@/lib/r2Client";

export const dynamic = "force-dynamic";

// Allowed folders: notices/, vault/, flats/A1001/, floor-plans/A/, events/<event id>/
function safeFolder(raw: string): string | null {
  const f = raw.replace(/^\/+|\/+$/g, "");
  if (f === "notices" || f === "vault") return f;
  if (/^flats\/[A-Z]\d{1,5}$/.test(f)) return f;
  if (/^events\/[0-9a-f-]{36}$/.test(f)) return f;
  if (/^floor-plans\/[A-Z]$/.test(f)) return f;
  return null;
}
const unauthorized = () => NextResponse.json({ error: "Please log in again." }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "Only the committee can change this." }, { status: 403 });
// Residents may read society folders and their own flat, and may only write to their own flat folder.
const canRead = (me: { isCommittee: boolean; flatId: string | null }, folder: string) =>
  me.isCommittee || !folder.startsWith("flats/") || folder === `flats/${me.flatId}`;
const canWrite = (me: { isCommittee: boolean; flatId: string | null }, folder: string) =>
  me.isCommittee || (!!me.flatId && folder === `flats/${me.flatId}`);

export async function GET(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return unauthorized();
  const r2 = getR2();
  if (!r2) return NextResponse.json({ files: [], warning: "File storage (R2) is not configured." });
  const folder = safeFolder(req.nextUrl.searchParams.get("folder") || "");
  if (!folder) return NextResponse.json({ error: "Bad folder" }, { status: 400 });
  if (!canRead(me, folder)) return forbidden();
  try {
    const files: any[] = [];
    let token: string | undefined;
    do {
      const res = await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: `${folder}/`, ContinuationToken: token }));
      for (const o of res.Contents || []) {
        if (!o.Key || o.Key.endsWith("/")) continue;
        const rest = o.Key.slice(folder.length + 1);
        if (rest.includes("/")) continue; // only direct children
        files.push({ key: o.Key, name: rest.replace(/^\d{10,}_/, ""), url: `${r2.publicUrl}/${o.Key}`, size: o.Size || 0, uploaded: o.LastModified?.toISOString() || null });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    files.sort((a, b) => (b.uploaded || "").localeCompare(a.uploaded || ""));
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
    if (!canWrite(me, folder)) return forbidden();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT[ext]) return NextResponse.json({ error: `Allowed files: ${Object.keys(ALLOWED_EXT).join(", ").toUpperCase()}` }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 400 });

    const safeName = file.name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "file";
    // Vault slots use a fixed name so a new upload replaces the old document.
    const key = folder === "vault" && slot ? `vault/${slot}.${ext}` : `${folder}/${Date.now()}_${safeName}.${ext}`;
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type || ALLOWED_EXT[ext] }));
    return NextResponse.json({ ok: true, key, url: `${r2.publicUrl}/${key}` });
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
  let key = typeof rawKey === "string" ? rawKey : "";
  if (!key && typeof url === "string" && url.startsWith(`${r2.publicUrl}/`)) key = url.slice(r2.publicUrl.length + 1);
  if (!key) return NextResponse.json({ ok: true });
  const folder = safeFolder(key.slice(0, key.lastIndexOf("/")));
  if (!folder) return NextResponse.json({ error: "Bad file" }, { status: 400 });
  if (!canWrite(me, folder)) return forbidden();
  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
