"use client";
// One button: makes the PDF, then opens the phone's share sheet (pick WhatsApp → the member).
// If the browser needs a fresh tap after the PDF is ready, the button turns into "TAP TO SHARE".
// Laptops that can't share files get a download instead.
import { useState } from "react";
import { canShareFile, downloadFile, shareFile } from "@/lib/pdfShare";

export default function SharePdfButton({ make, text, label = "📤 SHARE PDF", className = "" }: { make: () => Promise<File>; text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "ready" | "done">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");

  async function deliver(f: File) {
    if (!canShareFile(f)) { downloadFile(f); setState("done"); return; }
    const r = await shareFile(f, text);
    setState(r === "needs-tap" ? "ready" : "done");
  }
  async function click() {
    setErr("");
    if (state === "ready" && file) { await deliver(file); return; }
    setState("busy");
    try { const f = await make(); setFile(f); await deliver(f); }
    catch (e: any) { setErr(e?.message || "Could not make the PDF"); setState("idle"); }
  }
  const text_ = state === "busy" ? "MAKING PDF…" : state === "ready" ? "📤 TAP TO SHARE" : state === "done" ? "✓ " + label.replace(/^📤\s*/, "") : label;
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={click} disabled={state === "busy"} title="Makes the ledger statement as a PDF and opens the share menu (WhatsApp). On a laptop it downloads the PDF."
        className={`${state === "ready" ? "bg-[var(--gold)] text-black font-bold" : ""} ${className}`}>{text_}</button>
      {err && <span className="text-red-700 text-[10px]">{err}</span>}
    </span>
  );
}
