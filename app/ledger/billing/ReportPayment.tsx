"use client";
// MY FLAT → "I HAVE PAID": the member tells the committee about a payment (UTR / cheque no., optional screenshot).
// It shows as "waiting for verification" until the committee checks the bank and makes the receipt.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Flat } from "@/lib/society";
import { billBalance, dmy, inr, MODES, num, today, type Bill, type Payment } from "@/lib/billing";
import { loadReports, openProof, uploadProof, type PayReport } from "@/lib/payReports";

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

  async function load() { setReports(await loadReports(flat.id)); }
  useEffect(() => { load(); }, [flat.id]);
  if (reports === null) return null; // not set up yet

  const bill = unpaid.find((b) => b.id === f.bill);
  async function send() {
    setError(""); setMsg("");
    const amt = Math.round(num(f.amount) * 100) / 100;
    if (!bill) { setError("Choose the bill you paid."); return; }
    if (!(amt > 0)) { setError("Enter the amount you paid."); return; }
    if (amt > billBalance(bill, pays).balance + 0.001) { setError(`₹${inr(amt)} is more than the ₹${inr(billBalance(bill, pays).balance)} due on this bill.`); return; }
    if (!f.paid_on) { setError("Enter the date you paid."); return; }
    if (f.mode !== "Cash" && !f.ref.trim()) { setError(f.mode === "Cheque" ? "Enter the cheque number." : "Enter the UTR / transaction reference."); return; }
    setBusy(true);
    try {
      const proof_key = file ? await uploadProof(file, flat.id) : null;
      const { error } = await supabase.from("payment_reports").insert([{ flat_id: flat.id, bill_id: bill.id, amount: amt, paid_on: f.paid_on, mode: f.mode,
        ref: f.ref.trim() || null, bank: f.bank.trim() || null, note: f.note.trim() || null, proof_key }]);
      if (error) throw error;
      setOpen(false); setFile(null); setMsg("Thank you. The committee will check the bank and send your receipt."); await load(); onChanged?.();
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
        {!open && unpaid.length > 0 && <button onClick={() => { setF(blank()); setOpen(true); setError(""); setMsg(""); }} className="btn-navy px-4 py-2.5 font-bold tracking-[0.06em]">✓ I HAVE PAID</button>}
      </div>
      {msg && <div className="mt-3 border border-emerald-200 bg-emerald-50 text-emerald-800 p-2.5">{msg}</div>}
      {error && <div className="mt-3 border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
      {open && (
        <div className="mt-3 border-2 border-[var(--gold)] bg-[#fffdf5] p-3 space-y-2.5">
          <label className="block text-[10px] opacity-80">BILL PAID
            <select className="field mt-1" value={f.bill} onChange={(e) => { const b = unpaid.find((x) => x.id === e.target.value); setF({ ...f, bill: e.target.value, amount: b ? String(Math.max(0, billBalance(b, pays).balance - pendingFor(b.id))) : "" }); }}>
              {unpaid.map((b) => <option key={b.id} value={b.id}>{b.bill_no} • due ₹{inr(billBalance(b, pays).balance)}{b.period_from ? ` • ${dmy(b.period_from)} – ${dmy(b.period_to)}` : ""}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] opacity-80">AMOUNT PAID ₹<input className="field mt-1 text-right" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">DATE PAID<input type="date" className="field mt-1" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">HOW<select className="field mt-1" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="text-[10px] opacity-80">{f.mode === "Cheque" ? "CHEQUE NO. *" : f.mode === "Cash" ? "RECEIVED BY (optional)" : "UTR / TRANSACTION REF. *"}<input className="field mt-1" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">YOUR BANK (optional)<input className="field mt-1" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">SCREENSHOT / CHEQUE PHOTO (optional)<input type="file" accept="image/*,application/pdf" className="field mt-1 !py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          </div>
          <label className="block text-[10px] opacity-80">NOTE TO COMMITTEE (optional)<input className="field mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={send} disabled={busy} className="btn-navy px-4 py-2.5 font-bold">{busy ? "SENDING…" : "SEND TO COMMITTEE"}</button>
            <button onClick={() => setOpen(false)} className="btn-line px-4 py-2.5">CANCEL</button>
            <span className="opacity-60">Your dues reduce once the committee verifies the payment.</span>
          </div>
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
