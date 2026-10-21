"use client";
// ADMIN → Screenshot reading (AI): test with a screenshot and see exactly what came back; one-time Meta licence for the Llama model.
import { useState } from "react";
import { acceptLlamaLicence, readPaymentScreenshot, toJpeg, type ReadResult } from "@/lib/readPayment";

export default function AiReadPanel() {
  const [busy, setBusy] = useState(""); const [res, setRes] = useState<ReadResult | null>(null); const [lic, setLic] = useState("");
  async function test(f: File | null) {
    if (!f) return; setBusy("test"); setRes(null);
    setRes(await readPaymentScreenshot(await toJpeg(f))); setBusy("");
  }
  async function agree() {
    if (!confirm("Accept Meta's Llama 3.2 Community Licence and Acceptable Use Policy for the society's Cloudflare account?\n\nThis is needed once to use Cloudflare's Llama image model. Read the licence at llama.com/llama3_2/license before continuing.")) return;
    setBusy("agree"); const r = await acceptLlamaLicence(); setLic(`${r.ok ? "✓" : "✕"} ${r.answer}`); setBusy("");
  }
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px]">
      <div className="font-bold tracking-[0.12em]">SCREENSHOT READING (AI) • TEST</div>
      <div className="opacity-60 mt-1">Used by "I have paid" to fill in payment details. Upload any payment screenshot to see what is read. Nothing is saved.</div>
      <div className="flex flex-wrap gap-2 mt-3">
        <label className="btn-navy px-4 py-2 cursor-pointer">{busy === "test" ? "READING…" : "TEST WITH A SCREENSHOT"}<input type="file" accept="image/*" hidden onChange={(e) => { test(e.target.files?.[0] || null); e.target.value = ""; }} /></label>
        <button onClick={agree} disabled={!!busy} className="btn-line px-4 py-2">{busy === "agree" ? "…" : "ACCEPT META LLAMA LICENCE (ONE TIME)"}</button>
      </div>
      {lic && <div className="mt-2 border border-[var(--border)] bg-white p-2 break-words">Licence: {lic}</div>}
      {res && (
        <div className="mt-3 border border-[var(--border)] bg-white p-3 space-y-1 break-words">
          {res.error && <div className="text-red-700">{res.error}</div>}
          {Object.entries(res.fields).map(([k, v]) => <div key={k}><b>{k}</b>: {v}</div>)}
          {res.warnings.map((w, i) => <div key={i} className="text-amber-800">{w}</div>)}
          {res.model && <div className="opacity-60">Read by: {res.model}</div>}
          {res.detail && <div className="opacity-70">Technical detail: {res.detail}</div>}
        </div>)}
    </div>
  );
}
