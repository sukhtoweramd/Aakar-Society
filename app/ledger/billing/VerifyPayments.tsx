"use client";
// BILLING → VERIFY PAYMENTS: payments reported by members ("I have paid"). The committee checks the bank,
// then VERIFY makes the normal receipt (one step in the database), or REJECT with a reason the member sees.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, type Flat } from "@/lib/society";
import { billBalance, dmy, inr, num, openPrint, receiptHtml, waLink, type Bill, type Payment, type PrintCtx, type Settings, type Signatory } from "@/lib/billing";
import { openProof, type PayReport } from "@/lib/payReports";

type Props = { reports: PayReport[]; bills: Bill[]; pays: Payment[]; flats: Flat[]; settings: Settings; signatories: Signatory[]; pc: PrintCtx;
  email: string; mobileOf: (id: string) => string | null; openLedger: (id: string) => void; onDone: () => Promise<void> | void };

export default function VerifyPayments({ reports, bills, pays, flats, settings, signatories, pc, email, mobileOf, openLedger, onDone }: Props) {
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [billPick, setBillPick] = useState<Record<string, string>>({});
  const [signer, setSigner] = useState(settings.rcpt_signer || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Record<string, string>>({}); // report id → receipt no.
  const pending = reports.filter((r) => r.status === "pending").sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  const done = reports.filter((r) => r.status !== "pending" && Date.now() - new Date(r.reviewed_at || r.reported_at).getTime() < 30 * 864e5);
  const flatOf = (id: string) => flats.find((f) => f.id === id);
  const billOf = (id: string | null) => bills.find((b) => b.id === id);

  async function verify(r: PayReport) {
    const b = billOf(billPick[r.id] || r.bill_id); const a = Math.round(num(amt[r.id] ?? r.amount) * 100) / 100;
    if (!b) { setError("This report has no bill."); return; }
    if (!confirm(`Verify ₹${inr(a)} from ${label(flatOf(r.flat_id) as any)} (${r.mode}${r.ref ? " " + r.ref : ""}, ${dmy(r.paid_on)}) against bill ${b.bill_no}?\n\nOnly verify after you have seen this amount in the society's bank account (or received the cash/cheque). A receipt is made now.`)) return;
    setBusy(r.id); setError("");
    const { data, error } = await supabase.rpc("verify_payment_report", { p_id: r.id, p_amount: a, p_signer: signer || null, p_bill: b.id });
    if (error) setError(error.message); else { setMade((m) => ({ ...m, [r.id]: String(data) })); await onDone(); }
    setBusy(null);
  }
  async function reject(r: PayReport) {
    const why = prompt(`Not verified: ₹${inr(r.amount)} from ${label(flatOf(r.flat_id) as any)}.\nThe member sees this reason in MY FLAT.\n\nReason (e.g. "Not found in bank statement up to 20 Oct"):`);
    if (!why?.trim()) return;
    setBusy(r.id); setError("");
    const { error } = await supabase.from("payment_reports").update({ status: "rejected", reject_reason: why.trim(), reviewed_by: email, reviewed_at: new Date().toISOString() }).eq("id", r.id).eq("status", "pending");
    if (error) setError(error.message); else await onDone();
    setBusy(null);
  }
  const receiptOf = (r: PayReport) => pays.find((p) => p.id === r.payment_id) || pays.find((p) => p.receipt_no === made[r.id]);
  const printReceipt = (p: Payment) => { const b = bills.find((x) => x.id === p.bill_id)!; openPrint(`Receipt ${p.receipt_no}`, [receiptHtml(p, b, pc, pays.filter((x) => x.flat_id === p.flat_id))]); };
  const waReceipt = (p: Payment, f?: Flat) => waLink(mobileOf(p.flat_id), `Aakar Co-op Housing Society: Received ₹${inr(p.amount)} from Flat ${f ? label(f) : p.flat_id} on ${dmy(p.paid_on)} (${p.mode}). Receipt no. ${p.receipt_no}. Thank you. You can download the receipt in the society app under MY FLAT.`);

  return (
    <div className="space-y-4 mono text-[11px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px]">
        <div className="flex flex-wrap justify-between items-center gap-3 p-5">
          <div><div className="serif text-[18px] font-bold">Payments reported by members</div>
            <div className="opacity-60 mt-0.5">Members tap "I HAVE PAID" in MY FLAT. Check the bank statement, then VERIFY to make the receipt, or REJECT with a reason.</div></div>
          <label className="text-[10px] opacity-80">RECEIPT SIGNED BY<select className="field mt-1 !w-[220px]" value={signer} onChange={(e) => setSigner(e.target.value)}>
            <option value="">No signature</option>{signatories.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.designation} – {s.name}</option>)}</select></label>
        </div>
        {error && <div className="mx-5 mb-3 border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-[12px] min-w-[1080px]">
            <thead><tr className="bg-[var(--navy)] text-white text-left text-[10px] tracking-[0.08em]">
              <th className="px-3 py-2">REPORTED</th><th className="px-3 py-2">FLAT</th><th className="px-3 py-2">ALLOCATE TO BILL • DUE</th><th className="px-3 py-2">PAID ON • HOW • REF.</th>
              <th className="px-3 py-2">NOTE</th><th className="px-3 py-2 text-right">REPORTED ₹</th><th className="px-3 py-2 text-right">RECEIVED ₹</th><th className="px-3 py-2"></th></tr></thead>
            <tbody>
              {pending.map((r) => { const f = flatOf(r.flat_id); const b = billOf(billPick[r.id] || r.bill_id); const bal = b ? billBalance(b, pays).balance : 0;
                const options = bills.filter((x) => x.flat_id === r.flat_id && x.status === "active" && (billBalance(x, pays).balance > 0 || x.id === r.bill_id)).sort((x, y) => x.bill_date.localeCompare(y.bill_date)); return (
                <tr key={r.id} className="border-b border-[var(--border)] align-top bg-[#fffbea]">
                  <td className="px-3 py-2.5 whitespace-nowrap">{dmy(r.reported_at.slice(0, 10))}<div className="opacity-50 text-[10px]">{r.reported_by}</div></td>
                  <td className="px-3 py-2.5"><button onClick={() => openLedger(r.flat_id)} className="font-bold underline text-[var(--navy)]">{f ? label(f) : r.flat_id}</button><div>{f?.owner_name || ""}</div></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <select className="field !w-[170px] !py-1 !text-[11px]" value={b?.id || ""} onChange={(e) => setBillPick({ ...billPick, [r.id]: e.target.value })} title="The bill this payment is allocated to">
                      {!b && <option value="">— choose bill —</option>}{options.map((x) => <option key={x.id} value={x.id}>{x.bill_no}</option>)}</select>
                    {b && <div className={bal > 0 ? "text-amber-700" : "text-emerald-700"}>due ₹{inr(bal)}{b.id !== r.bill_id ? " • changed" : ""}</div>}</td>
                  <td className="px-3 py-2.5">{dmy(r.paid_on)} • <b>{r.mode}</b>{r.ref ? <> • <span className="font-bold">{r.ref}</span></> : ""}{r.bank ? <div className="opacity-70">{r.bank}</div> : null}
                    {r.proof_key && <div><button onClick={() => openProof(r.id)} className="underline text-[var(--navy)]">📎 view screenshot</button></div>}</td>
                  <td className="px-3 py-2.5 max-w-[200px]">{r.note || <span className="opacity-40">—</span>}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{inr(r.amount)}</td>
                  <td className="px-3 py-2.5 text-right"><input className="field !w-[100px] text-right !py-1" inputMode="decimal" value={amt[r.id] ?? String(r.amount)} onChange={(e) => setAmt({ ...amt, [r.id]: e.target.value })} title="Change if a different amount reached the bank" /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <button onClick={() => verify(r)} disabled={busy === r.id} className="btn-navy px-3 py-1.5 font-bold">{busy === r.id ? "…" : "✓ VERIFY & MAKE RECEIPT"}</button>
                    <button onClick={() => reject(r)} disabled={busy === r.id} className="ml-2 text-red-600 underline">reject</button></td>
                </tr>); })}
              {pending.length === 0 && <tr><td colSpan={8} className="px-5 py-6 text-center opacity-60">No payments waiting for verification.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {done.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px]">
          <div className="px-5 pt-4 pb-3 font-bold tracking-[0.12em] text-[10px]">HANDLED IN THE LAST 30 DAYS</div>
          <div className="overflow-x-auto border-t border-[var(--border)]"><table className="w-full text-[12px] min-w-[900px]"><tbody>
            {done.map((r) => { const f = flatOf(r.flat_id); const p = receiptOf(r); return (
              <tr key={r.id} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 whitespace-nowrap">{dmy((r.reviewed_at || r.reported_at).slice(0, 10))}</td>
                <td className="px-3 py-2 font-bold">{f ? label(f) : r.flat_id}</td>
                <td className="px-3 py-2 text-right tabular-nums">₹{inr(r.verified_amount ?? r.amount)}</td>
                <td className="px-3 py-2">{r.status === "verified" ? <span className="tag bg-emerald-50 text-emerald-700">VERIFIED</span> : <span className="tag bg-red-50 text-red-700">REJECTED</span>}
                  {r.status === "rejected" && <span className="ml-2 text-red-700">{r.reject_reason}</span>}</td>
                <td className="px-3 py-2 opacity-60">{r.reviewed_by}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{p && <><button onClick={() => printReceipt(p)} className="underline font-bold text-[var(--navy)]">{p.receipt_no}</button>
                  {mobileOf(p.flat_id) && <a href={waReceipt(p, f)} target="_blank" rel="noopener noreferrer" className="ml-2" title="Send receipt message on WhatsApp">📲</a>}</>}</td>
              </tr>); })}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}
