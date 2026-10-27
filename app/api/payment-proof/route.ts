// Payment screenshots for "I have paid". Kept under a random name that is never sent to the browser
// (the storage bucket serves files by name), and handed out only after a login check.
// POST (form: file, flat)  → { key }   — the flat itself or the committee
// GET  ?id=<report id>     → the image / PDF — only the committee or that flat (checked through the database rules)
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
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
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: TYPES[ext] })); // type from the extension, never from the browser (audit H3)
    return NextResponse.json({ key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}

// Short-lived viewing links (2 minutes), so the browser opens the picture itself: some office laptops block
// pages from building the picture in the browser. The link is given only after the login check below.
const LINK_SECONDS = 120;
function linkSecret() { return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.R2_SECRET_ACCESS_KEY || ""; }
function sign(id: string, exp: number, kind = "") { return createHmac("sha256", linkSecret()).update(`payproof:${kind}${id}:${exp}`).digest("hex"); }
function validLink(id: string, exp: number, sig: string, kind = "") {
  if (!linkSecret() || !(exp > Date.now() / 1000) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const a = Buffer.from(sign(id, exp, kind), "hex"), b = Buffer.from(sig, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id") || "";
  // kind=ev: the screenshot of an event registration payment; otherwise an "I have paid" bill payment report
  const kind = q.get("kind") === "ev" ? "ev" : "";
  const table = kind ? "event_registrations" : "payment_reports";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  let data: { flat_id: string; proof_key: string | null } | null = null;
  if (q.get("sig")) {
    // Opening a viewing link: no login header here, the signature proves it was handed out after one.
    if (!validLink(id, Number(q.get("exp")), q.get("sig") || "", kind)) return new NextResponse("This link has expired. Close this tab and click view screenshot again.", { status: 403 });
    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: "Not set up" }, { status: 500 });
    data = (await admin.from(table).select("flat_id, proof_key").eq("id", id).maybeSingle()).data as any;
  } else {
    const me = await getAuthedClient(req);
    if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    // Read through the user's own database session: the rules let a flat see only its own reports.
    data = (await me.db.from(table).select("flat_id, proof_key").eq("id", id).maybeSingle()).data as any;
    if (data?.proof_key && q.get("link") === "1") {
      const exp = Math.floor(Date.now() / 1000) + LINK_SECONDS;
      if (!linkSecret()) return NextResponse.json({ error: "Not set up" }, { status: 500 });
      return NextResponse.json({ url: `/api/payment-proof?id=${id}${kind ? "&kind=ev" : ""}&exp=${exp}&sig=${sign(id, exp, kind)}` });
    }
  }
  if (!data?.proof_key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!String(data.proof_key).startsWith(`${PROOF_FOLDER}/${data.flat_id}/`)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r2 = getR2();
  if (!r2) return NextResponse.json({ error: "File storage is not set up." }, { status: 500 });
  try {
    const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: data.proof_key }));
    const bytes = await (obj.Body as any).transformToByteArray();
    const ext = (String(data.proof_key).split(".").pop() || "").toLowerCase();
    // Audit H3: ignore the stored type (old uploads kept the browser's), never let the browser guess, and run
    // pictures in a sandbox so a disguised file cannot act as the app. (Chrome will not show a PDF that is
    // sandboxed, so PDFs get the fixed type + nosniff only; they open in the browser's own PDF viewer.)
    const type = TYPES[ext] || "application/octet-stream";
    const headers: Record<string, string> = { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" };
    if (type !== "application/pdf") headers["Content-Security-Policy"] = "sandbox";
    return new NextResponse(Buffer.from(bytes), { headers });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not open the screenshot." }, { status: 500 });
  }
}
