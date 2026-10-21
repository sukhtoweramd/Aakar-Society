"use client";
// MY FLAT → "I HAVE PAID": the member tells the committee about a payment (UTR / cheque no., optional screenshot).
// It shows as "waiting for verification" until the committee checks the bank and makes the receipt.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Flat } from "@/lib/society";
import { billBalance, dmy, inr, MODES, num, today, type Bill, type Payment } from "@/lib/billing";
import { loadReports, openProof, uploadProof, type PayReport } from "@/lib/payReports";
import { readPaymentScreenshot, toJpeg, utrAlreadyReported } from "@/lib/readPayment";

export default function ReportPayment({ flat, bills, pays, onChanged }: { flat: Flat; bills: Bill[]; pays: Payment[]; onChanged?: () => void }) {
  const [reports, setReports] = useState<PayReport[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [msg, setMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const unpaid = bills.filter((b) => b.flat_id === flat.id && b.status === "active" && billBalance(b, pays).balance > 0).sort((a, b) => a.bill_date.localeCompare(b.bill_date));
  const pendingFor = (billId: string) => (reports || []).filter((r) => r.bill_id === billId && r.status === "pending").reduce((n, r) => n + num(r.amount), 0);
  const blank = () => { const b = unpaid[0]; return { bill: b?.id || "", amount: b ? String(Math.max(0, billBalance(b, pays).balance - pendingFor(b.id))) : "", paid_on: today(), mode: "UPI", ref: "", bank: "", note: "" }; };
  const [f, setF] = useState(blank());
  // screenshot-first: the app reads the screenshot and fills the form; the member checks and sends
  const [manual, setManual] = useState(false);
  const [reading, setReading] = useState(false);
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<{ text: string; tone: "ok" | "warn" | "bad" }[]>([]);
  const [thumb, setThumb] = useState("");
  const showForm = manual || !!file;

  async function load() { setReports(await loadReports(flat.id)); }
  useEffect(() => { load(); }, [flat.id]);
  if (reports === null) return null; // not set up yet

  const bill = unpaid.find((b) => b.id === f.bill);
  async function pickScreenshot(raw: File | null) {
    if (!raw) return;
    setError(""); setNotes([]); setFilled(new Set());
    const img = await toJpeg(raw);
    setFile(img); setThumb(img.type.startsWith("image/") ? URL.createObjectURL(img) : "");
    if (!img.type.startsWith("image/")) { setNotes([{ text: "PDFs cannot be read automatically. Please fill in the details below.", tone: "warn" }]); return; }
    setReading(true);
    const r = await readPaymentScreenshot(img);
    setReading(false);
    const n: { text: string; tone: "ok" | "warn" | "bad" }[] = [];
    if (r.error) n.push({ text: r.error, tone: "warn" });
    const got = Object.fromEntries(Object.entries(r.fields).filter(([, v]) => v)) as Record<string, string>;
    if (Object.keys(got).length) {
      setF((x) => ({ ...x, ...got }));
      setFilled(new Set(Object.keys(got)));
      n.push({ text: "Filled from your screenshot. Please check, and correct anything that is wrong.", tone: "ok" });
      const due = bill ? billBalance(bill, pays).balance : 0;
      const amt = num(got.amount);
      if (bill && amt > 0 && amt < due - 0.001) n.push({ text: `₹${inr(amt)} read; the bill due is ₹${inr(due)}. Part payment? That's fine; send it.`, tone: "warn" });
      if (bill && amt > due + 0.001) n.push({ text: `₹${inr(amt)} read, which is more than the ₹${inr(due)} due on this bill. Please check the amount.`, tone: "bad" });
      if (got.ref) { const d = await utrAlreadyReported(got.ref); if (d.found) n.push({ text: `This reference was already reported${d.on ? ` on ${dmy(d.on)}` : ""}. Please check you are not reporting the same payment twice.`, tone: "bad" }); }
    }
    r.warnings.forEach((w) => n.push({ text: w, tone: /FAILED/.test(w) ? "bad" : "warn" }));
    setNotes(n);
  }
  const hl = (k: string) => (filled.has(k) ? " !bg-emerald-50 !border-emerald-500" : "");
  const setFld = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); if (filled.has(k)) setFilled((s) => { const n = new Set(s); n.delete(k); return n; }); };
  async function send() {
    setError(""); setMsg("");
    const amt = Math.round(num(f.amount) * 100) / 100;
    if (!bill) { setError("Choose the bill you paid."); return; }
    if (!(amt > 0)) { setError("Enter the amount you paid."); return; }
    if (amt > billBalance(bill, pays).balance + 0.001) { setError(`₹${inr(amt)} is more than the ₹${inr(billBalance(bill, pays).balance)} due on this bill.`); return; }
    if (!f.paid_on) { setError("Enter the date you paid."); return; }
    if (f.mode !== "Cash" && !f.ref.trim()) { setError(f.mode === "Cheque" ? "Enter the cheque number." : "Enter the UTR / transaction reference."); return; }
    if (f.ref.trim() && !notes.some((n) => /already reported/.test(n.text))) {
      const d = await utrAlreadyReported(f.ref);
      if (d.found && !confirm(`This reference was already reported${d.on ? ` on ${dmy(d.on)}` : ""}. Send anyway?`)) return;
    }
    setBusy(true);
    try {
      const proof_key = file ? await uploadProof(file, flat.id) : null;
      const { error } = await supabase.from("payment_reports").insert([{ flat_id: flat.id, bill_id: bill.id, amount: amt, paid_on: f.paid_on, mode: f.mode,
        ref: f.ref.trim() || null, bank: f.bank.trim() || null, note: f.note.trim() || null, proof_key }]);
      if (error) throw error;
      setOpen(false); setFile(null); setThumb(""); setNotes([]); setFilled(new Set()); setManual(false); setMsg("Thank you. The committee will check the bank and send your receipt."); await load(); onChanged?.();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  async function withdraw(r: PayReport) {
    if (!confirm(`Withdraw your report of ₹${inr(r.amount)} paid on ${dmy(r.paid_on)}?`)) return;
    const { error } = await supabase.from("payment_reports").delete().eq("id", r.id);
    if (error) setError(error.message); else load();
  }
  const billNo = (id: string | null) => bills.find((b) => b.id === id)?.bill_no || "—";
  const tag = (r: PayReport) => r.status === "pending" ? <span className="tag bg-amber-50 text-amber-700">WAITING FOR VERIFICATION</span>
    : r.status === "verified" ? <span className="tag bg-emerald-50 text-emerald-700">VERIFIED • RECEIPT MADE</span> : <span className="tag bg-red-50 text-red-700">NOT VERIFIED</span>;
  const recent = reports.filter((r) => r.status === "pending" || Date.now() - new Date(r.reviewed_at || r.reported_at).getTime() < 60 * 864e5);

  if (!unpaid.length && !recent.length) return null;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 mono text-[11px] mb-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div><div className="font-bold tracking-[0.12em] text-[10px]">PAID ALREADY?</div>
          <div className="opacity-70 mt-0.5">Tell the committee: they check the bank and your receipt appears here.</div></div>
        {!open && unpaid.length > 0 && <button onClick={() => { setF(blank()); setOpen(true); setError(""); setMsg(""); setFile(null); setThumb(""); setNotes([]); setFilled(new Set()); setManual(false); }} className="btn-navy px-4 py-2.5 font-bold tracking-[0.06em]">✓ I HAVE PAID</button>}
      </div>
      {msg && <div className="mt-3 border border-emerald-200 bg-emerald-50 text-emerald-800 p-2.5">{msg}</div>}
      {error && <div className="mt-3 border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
      {open && (
        <div className="mt-3 border-2 border-[var(--gold)] bg-[#fffdf5] p-3 space-y-2.5">
          <label className="block text-[10px] opacity-80">BILL PAID
            <select className="field mt-1" value={f.bill} onChange={(e) => { const b = unpaid.find((x) => x.id === e.target.value); setF({ ...f, bill: e.target.value, amount: b ? String(Math.max(0, billBalance(b, pays).balance - pendingFor(b.id))) : "" }); }}>
              {unpaid.map((b) => <option key={b.id} value={b.id}>{b.bill_no} • due ₹{inr(billBalance(b, pays).balance)}{b.period_from ? ` • ${dmy(b.period_from)} – ${dmy(b.period_to)}` : ""}</option>)}
            </select></label>
          {!showForm && (
            <div>
              <label className="block border-2 border-dashed border-[var(--navy)] bg-white p-4 text-center cursor-pointer">
                <div className="text-[24px]">📷</div>
                <div className="font-bold tracking-[0.08em] mt-1">UPLOAD PAYMENT SCREENSHOT</div>
                <div className="opacity-65 mt-1">The UPI or net-banking "payment successful" screen. The app fills in the details for you.</div>
                <input type="file" accept="image/*" hidden onChange={(e) => { pickScreenshot(e.target.files?.[0] || null); e.target.value = ""; }} />
              </label>
              <button onClick={() => setManual(true)} className="underline mt-2 block mx-auto">Paid by cash or cheque, or no screenshot? Fill in by hand</button>
            </div>)}
          {file && (
            <div className="flex gap-3 items-center">
              {thumb && <img src={thumb} alt="Payment screenshot" className="h-24 w-auto border border-[var(--border)] bg-white" />}
              <div className="flex-1">
                {reading ? <div className="font-bold">Reading your screenshot…<div className="h-1.5 bg-[var(--border)] mt-2 overflow-hidden"><div className="h-1.5 w-1/2 bg-[var(--gold)] animate-pulse" /></div></div>
                  : <div className="opacity-70">Screenshot attached. It goes to the committee with your report.</div>}
                {!reading && <label className="underline cursor-pointer inline-block mt-1">use another screenshot<input type="file" accept="image/*" hidden onChange={(e) => { pickScreenshot(e.target.files?.[0] || null); e.target.value = ""; }} /></label>}
              </div>
            </div>)}
          {notes.map((n, i) => <div key={i} className={`p-2 border ${n.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : n.tone === "bad" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{n.tone === "bad" ? "⚠ " : n.tone === "ok" ? "✓ " : ""}{n.text}</div>)}
          {showForm && !reading && <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] opacity-80">AMOUNT PAID ₹<input className={"field mt-1 text-right" + hl("amount")} inputMode="decimal" value={f.amount} onChange={(e) => setFld("amount", e.target.value)} /></label>
            <label className="text-[10px] opacity-80">DATE PAID<input type="date" className={"field mt-1" + hl("paid_on")} value={f.paid_on} onChange={(e) => setFld("paid_on", e.target.value)} /></label>
            <label className="text-[10px] opacity-80">HOW<select className={"field mt-1" + hl("mode")} value={f.mode} onChange={(e) => setFld("mode", e.target.value)}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="text-[10px] opacity-80">{f.mode === "Cheque" ? "CHEQUE NO. *" : f.mode === "Cash" ? "RECEIVED BY (optional)" : "UTR / TRANSACTION REF. *"}<input className={"field mt-1" + hl("ref")} value={f.ref} onChange={(e) => setFld("ref", e.target.value)} /></label>
            <label className="text-[10px] opacity-80">YOUR BANK (optional)<input className={"field mt-1" + hl("bank")} value={f.bank} onChange={(e) => setFld("bank", e.target.value)} /></label>
            {!file && <label className="text-[10px] opacity-80">SCREENSHOT / CHEQUE PHOTO (optional)<input type="file" accept="image/*,application/pdf" className="field mt-1 !py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>}
          </div>
          <label className="block text-[10px] opacity-80">NOTE TO COMMITTEE (optional)<input className="field mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={send} disabled={busy} className="btn-navy px-4 py-2.5 font-bold">{busy ? "SENDING…" : "SEND TO COMMITTEE"}</button>
            <button onClick={() => setOpen(false)} className="btn-line px-4 py-2.5">CANCEL</button>
            <span className="opacity-60">Your dues reduce once the committee verifies the payment.</span>
          </div></>}
          {!showForm && <button onClick={() => setOpen(false)} className="btn-line px-4 py-2">CANCEL</button>}
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-3 space-y-2">
          {recent.map((r) => (
            <div key={r.id} className="border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b className="tabular-nums">₹{inr(r.verified_amount ?? r.amount)}</b> <span className="opacity-60">for {billNo(r.bill_id)}</span></span>{tag(r)}</div>
              <div className="opacity-70 mt-1">Paid {dmy(r.paid_on)} • {r.mode}{r.ref ? ` • ${r.ref}` : ""} • reported {dmy(r.reported_at.slice(0, 10))}</div>
              {r.status === "rejected" && r.reject_reason && <div className="text-red-700 mt-1">Committee: {r.reject_reason}</div>}
              {(r.proof_key || r.status === "pending") && <div className="mt-1.5 flex gap-4">
                {r.proof_key && <button onClick={() => openProof(r.id)} className="underline">screenshot</button>}
                {r.status === "pending" && <button onClick={() => withdraw(r)} className="underline text-red-600">withdraw</button>}</div>}
            </div>))}
        </div>
      )}
    </div>
  );
}
