"use client";
// "I have paid": read a payment screenshot (server → Cloudflare Workers AI) and the duplicate-reference check.
import { supabase } from "./supabaseClient";

export type ReadResult = { fields: Partial<Record<"amount" | "paid_on" | "ref" | "mode" | "bank", string>>; warnings: string[]; error?: string; detail?: string; model?: string };

/** Phone photos can be large or HEIC: turn them into a JPEG of at most 1600 px before reading / uploading. */
export async function toJpeg(file: File, max = 1600): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    // toDataURL + plain JavaScript decoding: on some laptops a canvas.toBlob() result cannot be read back.
    const url = c.toDataURL("image/jpeg", 0.88);
    if (!url.startsWith("data:image/jpeg")) return file;
    const bin = atob(url.slice(url.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < 1000) return file;
    return new File([bytes], (file.name.replace(/\.[^.]+$/, "") || "screenshot") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

async function token() { return (await supabase.auth.getSession()).data.session?.access_token || ""; }

const FAIL = "Could not read the screenshot. Please fill in the details by hand.";
/** Never leaves the member waiting: whatever happens, an answer comes back within about 50 seconds. */
export async function readPaymentScreenshot(file: File): Promise<ReadResult> {
  let stage = "login check";
  const work = (async (): Promise<ReadResult> => {
    const t = await token();
    stage = "preparing the image";
    const image: string | null = await new Promise((res) => {
      const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(file);
      setTimeout(() => res(null), 10000);
    });
    if (!image) return { fields: {}, warnings: [], error: "This picture could not be opened on this device. Save it to Downloads (or the phone's Gallery) and choose it from there, or fill in the details by hand.", detail: "the browser could not read the file (often a OneDrive online-only file or office security software)" };
    stage = "sending to the server";
    const res = await fetch("/api/read-payment", { method: "POST", body: JSON.stringify({ image }), headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000) });
    stage = "reading the answer";
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { fields: {}, warnings: [], error: j.error || FAIL, detail: j.detail || `server status ${res.status}` };
    return { fields: j.fields || {}, warnings: j.warnings || [], detail: j.detail, model: j.model };
  })().catch((e: any): ReadResult => ({ fields: {}, warnings: [], error: FAIL, detail: `${stage}: ${e?.name === "TimeoutError" ? "took too long" : e?.message || e}` }));
  const limit = new Promise<ReadResult>((res) => setTimeout(() => res({ fields: {}, warnings: [], error: FAIL, detail: `${stage}: no answer in 50 seconds` }), 50000));
  return Promise.race([work, limit]);
}

/** Was this UTR / reference already reported or received? (never says by which flat) */
export async function utrAlreadyReported(ref: string): Promise<{ found: boolean; on?: string }> {
  if (ref.replace(/[^A-Za-z0-9]/g, "").length < 6) return { found: false };
  const { data, error } = await supabase.rpc("utr_already_reported", { p_ref: ref });
  return error || !data ? { found: false } : (data as any);
}

/** ADMIN: accept Meta's Llama 3.2 licence once for the society's Cloudflare account. */
export async function acceptLlamaLicence(): Promise<{ ok: boolean; answer: string }> {
  const fd = new FormData(); fd.append("action", "agree");
  const res = await fetch("/api/read-payment", { method: "POST", body: fd, headers: { Authorization: `Bearer ${await token()}` } });
  const j = await res.json().catch(() => ({}));
  return { ok: !!j.ok, answer: j.answer || j.error || `status ${res.status}` };
}

/** ADMIN: check the connection to Cloudflare without sending an image. */
export async function checkAiConnection(): Promise<string[]> {
  try {
    const fd = new FormData(); fd.append("action", "check");
    const res = await fetch("/api/read-payment", { method: "POST", body: fd, headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(40000) });
    const j = await res.json().catch(() => ({}));
    return j.lines || [j.error || `server status ${res.status}`];
  } catch (e: any) { return [`Your device could not reach the server: ${e?.name === "TimeoutError" ? "no answer in 40 seconds" : e?.message || e}`]; }
}
