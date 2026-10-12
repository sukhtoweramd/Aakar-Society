// Upload / delete files in Cloudflare R2 (notice attachments and flat documents). Admin login required.
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getAuthedClient } from "@/lib/serverAuth";
import { getR2, MAX_FILE_BYTES, ALLOWED_TYPES } from "@/lib/r2Client";

export const dynamic = "force-dynamic";
const FOLDERS = ["notices", "flats"];

export async function POST(req: NextRequest) {
  if (!(await getAuthedClient(req))) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const r2 = getR2();
  if (!r2) return NextResponse.json({ error: "File storage (R2) is not configured in Vercel environment variables." }, { status: 500 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "notices");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!FOLDERS.includes(folder)) return NextResponse.json({ error: "Bad folder" }, { status: 400 });
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: "Only PDF, JPG, PNG or DOCX files are allowed." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 400 });

    const safeName = file.name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "file";
    const key = `${folder}/${Date.now()}_${safeName}.${ext}`;
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
    return NextResponse.json({ ok: true, url: `${r2.publicUrl}/${key}` });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getAuthedClient(req))) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const r2 = getR2();
  if (!r2) return NextResponse.json({ ok: true }); // nothing to delete
  const { url } = await req.json().catch(() => ({ url: "" }));
  const prefix = `${r2.publicUrl}/`;
  if (typeof url !== "string" || !url.startsWith(prefix)) return NextResponse.json({ ok: true });
  const key = url.slice(prefix.length);
  if (!FOLDERS.some((f) => key.startsWith(`${f}/`))) return NextResponse.json({ error: "Bad file" }, { status: 400 });
  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
