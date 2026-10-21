// "I have paid" → read a payment screenshot with Cloudflare Workers AI and return the details to pre-fill the form.
// Only the image is sent (no member records). The AI only reads; this code checks every value before returning it,
// and the member still checks and sends the form. Needs CLOUDFLARE_AI_TOKEN (+ the account id already used for R2) in Vercel.
import { NextRequest, NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Tried in order. Mistral needs no licence; Llama 3.2 Vision is Cloudflare's documented image model (needs Meta's licence accepted once).
const MISTRAL = "@cf/mistralai/mistral-small-3.1-24b-instruct";
const LLAMA = "@cf/meta/llama-3.2-11b-vision-instruct";
const MODES = ["UPI", "NEFT", "IMPS", "Cheque", "Other"];
const PROMPT = `You read Indian payment confirmation screenshots (UPI apps, net banking, bank messages).
Reply with ONLY one JSON object, no other text, with these keys:
"amount": the amount paid in rupees as a number without commas or symbols,
"date": the payment date as YYYY-MM-DD,
"reference": the UTR / UPI transaction ID / reference number exactly as shown, without spaces,
"mode": one of "UPI", "NEFT", "IMPS", "Cheque", "Other",
"bank": the payer's bank or payment app name,
"status": "success", "failed" or "pending",
"paid_to": the payee name or UPI ID.
Use null for anything that is not clearly visible. Never guess or invent a value.`;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : v);
function firstJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
function istToday() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  if (!account || !token) return NextResponse.json({ error: "Screenshot reading is not set up yet. Please fill in the details by hand." }, { status: 503 });
  try {
    const form = await req.formData();
    if (form.get("action") === "agree") {
      // One-time acceptance of Meta's Llama 3.2 licence for this Cloudflare account (committee only, pressed by a person in ADMIN).
      if (!me.isCommittee) return NextResponse.json({ error: "Only the committee can do this." }, { status: 403 });
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${LLAMA}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "agree" }) });
      const j: any = await r.json().catch(() => ({}));
      return NextResponse.json({ ok: r.ok, answer: j?.result?.response || j?.errors?.[0]?.message || `status ${r.status}` });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No image" }, { status: 400 });
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return NextResponse.json({ error: "Only photos can be read; please fill in the details by hand." }, { status: 400 });
    if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Image too large to read." }, { status: 400 });
    const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const run = (model: string, body: any) => fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const attempts: [string, any][] = [
      [MISTRAL, { messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }], max_tokens: 300, temperature: 0 }],
      [LLAMA, { messages: [{ role: "user", content: PROMPT }], image: dataUrl, max_tokens: 300, temperature: 0 }],
    ];
    let raw: any = null; const errors: string[] = []; let used = "";
    for (const [model, body] of attempts) {
      const res = await run(model, body);
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) { errors.push(`${model.split("/").pop()}: ${j?.errors?.[0]?.message || `status ${res.status}`}`); continue; }
      const out = j.result?.response;
      raw = typeof out === "string" ? firstJson(out) : out && typeof out === "object" ? out : null;
      used = model;
      if (raw) break;
      errors.push(`${model.split("/").pop()}: answer was not readable`);
    }
    if (!raw) {
      console.error("read-payment AI errors:", errors.join(" | "));
      const failed = errors.length && errors.every((e) => !/not readable/.test(e));
      return NextResponse.json(failed ? { error: "Could not read the screenshot. Please fill in the details by hand.", detail: errors.join(" | ") }
        : { fields: {}, warnings: ["Could not read the screenshot clearly. Please fill in the details below."], detail: errors.join(" | ") }, { status: failed ? 502 : 200 });
    }
    // Check every value; anything doubtful is left empty for the member to type.
    const fields: Record<string, string> = {}; const warnings: string[] = [];
    const amt = Number(String(clean(raw.amount) ?? "").replace(/[^\d.]/g, ""));
    if (amt > 0 && amt < 1e7) fields.amount = String(Math.round(amt * 100) / 100);
    const d = String(clean(raw.date) ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) && d <= istToday() && d >= "2020-01-01") fields.paid_on = d;
    const ref = String(clean(raw.reference) ?? "").replace(/\s+/g, "");
    if (/^[A-Za-z0-9\-/]{6,35}$/.test(ref)) fields.ref = ref;
    const mode = String(clean(raw.mode) ?? "");
    if (MODES.includes(mode)) fields.mode = mode;
    const bank = String(clean(raw.bank) ?? "");
    if (bank && bank.length <= 40 && !/^null$/i.test(bank)) fields.bank = bank;
    const status = String(clean(raw.status) ?? "").toLowerCase();
    if (status === "failed") warnings.push("The screenshot seems to show a FAILED payment. Please check before sending.");
    if (status === "pending") warnings.push("The screenshot seems to show a PENDING payment. You may want to wait until it succeeds.");
    if (!Object.keys(fields).length) warnings.push("Could not read the screenshot clearly. Please fill in the details below.");
    return NextResponse.json({ fields, warnings, paid_to: typeof raw.paid_to === "string" ? raw.paid_to.slice(0, 60) : null, model: used.split("/").pop() });
  } catch (e: any) {
    console.error("read-payment failed:", e?.message);
    return NextResponse.json({ error: "Could not read the screenshot. Please fill in the details by hand." }, { status: 500 });
  }
}
