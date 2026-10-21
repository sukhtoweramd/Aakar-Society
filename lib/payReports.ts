"use client";
// "I have paid": payments reported by members, verified by the committee.
import { supabase } from "./supabaseClient";
import { pictureText } from "./readPayment";

export type PayReport = {
  id: string; flat_id: string; bill_id: string | null; amount: number; paid_on: string; mode: string;
  bank: string | null; ref: string | null; note: string | null; proof_key: string | null;
  status: "pending" | "verified" | "rejected"; verified_amount: number | null; payment_id: string | null;
  reject_reason: string | null; reported_by: string | null; reported_at: string; reviewed_by: string | null; reviewed_at: string | null;
};

/** Loads reports (all for the committee, own flat for a member). `null` = the table is not set up yet. */
export async function loadReports(flatId?: string): Promise<PayReport[] | null> {
  let q = supabase.from("payment_reports").select("*").order("reported_at", { ascending: false });
  if (flatId) q = q.eq("flat_id", flatId);
  const { data, error } = await q;
  if (error) return /payment_reports|schema cache|does not exist/i.test(error.message) ? null : [];
  return (data as PayReport[]) || [];
}

async function token() { return (await supabase.auth.getSession()).data.session?.access_token || ""; }

/** Uploads a screenshot; returns its secret key (kept in the report row only). */
export async function uploadProof(file: File, flatId: string): Promise<string> {
  const text = pictureText(file);
  const auth = { Authorization: `Bearer ${await token()}` };
  const signal = AbortSignal.timeout(60000); // never leave "Sending…" hanging
  let res: Response;
  if (text) res = await fetch("/api/payment-proof", { method: "POST", body: JSON.stringify({ image: text, flat: flatId }), headers: { ...auth, "Content-Type": "application/json" }, signal });
  else { const fd = new FormData(); fd.append("file", file); fd.append("flat", flatId); res = await fetch("/api/payment-proof", { method: "POST", body: fd, headers: auth, signal }); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.key) throw new Error(j.error || "Upload failed");
  return j.key;
}

/** Opens the screenshot in a new tab (fetched with the login, never by public link). */
export async function openProof(reportId: string) {
  const w = window.open("", "_blank");
  try {
    const res = await fetch(`/api/payment-proof?id=${reportId}`, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not open");
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location.href = url; else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e: any) { w?.close(); alert(e.message); }
}
