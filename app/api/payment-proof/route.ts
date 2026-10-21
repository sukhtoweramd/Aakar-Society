// Payment screenshots for "I have paid". Kept under a random name that is never sent to the browser
// (the storage bucket serves files by name), and handed out only after a login check.
// POST (form: file, flat)  → { key }   — the flat itself or the committee
// GET  ?id=<report id>     → the image / PDF — only the committee or that flat (checked through the database rules)
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getAuthedClient } from "@/lib/serverAuth";
import { getR2, MAX_FILE_BYTES } from "@/lib/r2Client";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };
const PROOF_FOLDER = "payproofs";

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const r2 = getR2();
  if (!r2) return NextResponse.json({ error: "File storage is not set up; send the report without a screenshot." }, { status: 500 });
  try {
    // Either JSON { image: "data:image/jpeg;base64,...", flat } (the shrunk screenshot as text: works on office
    // laptops that block page scripts from reading files) or a normal form upload { file, flat }.
    let file: File | null = null; let flat = "";
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b: any = await req.json().catch(() => ({}));
      flat = String(b?.flat || "");
      const m = String(b?.image || "").match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return NextResponse.json({ error: "Please attach a photo (JPG, PNG) or a PDF." }, { status: 400 });
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      file = new File([Buffer.from(m[2], "base64")], `screenshot.${ext}`, { type: `image/${m[1]}` });
    } else {
      const form = await req.formData();
      const f = form.get("file"); flat = String(form.get("flat") || "");
      if (f instanceof File) file = f;
    }
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!/^[A-Z]\d{1,5}$/.test(flat)) return NextResponse.json({ error: "Bad flat" }, { status: 400 });
    if (!me.isCommittee && me.flatId !== flat) return NextResponse.json({ error: "Not your flat." }, { status: 403 });
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!TYPES[ext]) return NextResponse.json({ error: "Please attach a photo (JPG, PNG) or a PDF." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 400 });
    const key = `${PROOF_FOLDER}/${flat}/${Date.now()}_${randomBytes(16).toString("hex")}.${ext}`;
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type || TYPES[ext] }));
    return NextResponse.json({ key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // Read through the user's own database session: the rules let a flat see only its own reports.
  const { data } = await me.db.from("payment_reports").select("flat_id, proof_key").eq("id", id).maybeSingle();
  if (!data?.proof_key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!String(data.proof_key).startsWith(`${PROOF_FOLDER}/${data.flat_id}/`)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r2 = getR2();
  if (!r2) return NextResponse.json({ error: "File storage is not set up." }, { status: 500 });
  try {
    const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: data.proof_key }));
    const bytes = await (obj.Body as any).transformToByteArray();
    const ext = String(data.proof_key).split(".").pop() || "";
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": obj.ContentType || TYPES[ext] || "application/octet-stream", "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not open the screenshot." }, { status: 500 });
  }
}
