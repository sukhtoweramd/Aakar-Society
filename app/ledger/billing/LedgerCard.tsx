"use client";
// Member ledger card: one line per bill, payments under it, receipts. Read-only for members.
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, type Flat } from "@/lib/society";
import {
  billBalance, billHtml, dmy, flatTotals, inr, MODES, num, openPrint, receiptHtml, reserveNumbers, statementHtml, statementPdf, today, waLink,
  type Bill, type Payment, type PrintCtx, type Signatory,
} from "@/lib/billing";
import SharePdfButton from "./SharePdfButton";
import { deleteDoc, useMainAdmin } from "@/lib/docDelete";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortPeriod = (a: string, b: string) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() ? `${MON[x.getMonth()]}–${MON[y.getMonth()]} ${x.getFullYear()}` : `${MON[x.getMonth()]} ${x.getFullYear()} – ${MON[y.getMonth()]} ${y.getFullYear()}`; };

type Props = {
  flat: Flat; bills: Bill[]; pays: Payment[]; pc: PrintCtx; editable: boolean; email: string;
  mobile?: string | null; onChanged?: () => void; nav?: React.ReactNode;
};

export default function LedgerCard({ flat, bills, pays, pc, editable, email, mobile, onChanged, nav }: Props) {
  const [showSettled, setShowSettled] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: "", paid_on: today(), mode: "NEFT", bank: "", ref: "", signer: "" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canDelete = useMainAdmin(editable);

  const signers = pc.signatories.filter((s) => s.active);
  const defaultSigner = pc.settings?.rcpt_signer || signers[0]?.id || "";
  const myBills = useMemo(() => bills.filter((b) => b.flat_id === flat.id).sort((a, b) => a.bill_date.localeCompare(b.bill_date) || a.bill_no.localeCompare(b.bill_no)), [bills, flat.id]);
  const myPays = useMemo(() => pays.filter((p) => p.flat_id === flat.id), [pays, flat.id]);
  const t = flatTotals(myBills, myPays);
  const lastPay = myPays.filter((p) => p.status === "active").sort((a, b) => b.paid_on.localeCompare(a.paid_on))[0];
  const shown = myBills.filter((b) => (showCancelled || b.status === "active") && (showSettled || b.status === "cancelled" || billBalance(b, myPays).balance > 0));
  const settledCount = myBills.filter((b) => b.status === "active" && billBalance(b, myPays).balance <= 0).length;

  function startEntry(b: Bill) {
    setEntryFor(b.id); setError("");
    setForm({ amount: String(billBalance(b, myPays).balance), paid_on: today(), mode: "NEFT", bank: "", ref: "", signer: defaultSigner });
  }
  async function savePayment(b: Bill) {
    const amt = Math.round(num(form.amount) * 100) / 100;
    const bal = billBalance(b, myPays).balance;
    if (!(amt > 0)) { setError("Enter the amount received."); return; }
    if (amt > bal + 0.001) { setError(`₹${inr(amt)} is more than the ₹${inr(bal)} due on this bill. Record the extra against the next bill.`); return; }
    if (!form.paid_on) { setError("Enter the date received."); return; }
    if (form.mode === "Cheque" && !form.ref.trim()) { setError("Enter the cheque number."); return; }
    setBusy(true); setError("");
    try {
      const [rno] = await reserveNumbers("receipt", 1);
      const sg: Signatory | undefined = pc.signatories.find((s) => s.id === form.signer);
      const { error } = await supabase.from("payments").insert([{
        receipt_no: rno, bill_id: b.id, flat_id: flat.id, amount: amt, paid_on: form.paid_on, mode: form.mode,
        bank: form.bank.trim() || null, ref: form.ref.trim() || null, received_from: b.bill_to,
        signer_id: sg?.id || null, signer_name: sg?.name || null, signer_designation: sg?.designation || null, created_by: email,
      }]);
      if (error) throw error;
      setEntryFor(null); onChanged?.();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  async function cancelPayment(p: Payment) {
    const why = prompt(`Cancel receipt ${p.receipt_no} (₹${inr(p.amount)})?\nThe receipt stays on record marked CANCELLED and the bill balance goes back up.\n\nReason:`);
    if (!why?.trim()) return;
    const { error } = await supabase.from("payments").update({ status: "cancelled", cancel_reason: why.trim(), cancelled_by: email, cancelled_at: new Date().toISOString() }).eq("id", p.id);
    if (error) setError(error.message); else onChanged?.();
  }
  async function cancelBill(b: Bill) {
    if (myPays.some((p) => p.bill_id === b.id && p.status === "active")) { setError(`Bill ${b.bill_no} has payments. Cancel its receipts first.`); return; }
    const why = prompt(`Cancel bill ${b.bill_no} (₹${inr(b.amount)})?\nIt stays on record marked CANCELLED.\n\nReason:`);
    if (!why?.trim()) return;
    const { error } = await supabase.from("bills").update({ status: "cancelled", cancel_reason: why.trim(), cancelled_by: email, cancelled_at: new Date().toISOString() }).eq("id", b.id);
    if (error) setError(error.message); else onChanged?.();
  }

  async function del(kind: "bill" | "receipt", id: string, no: string, extra: string) {
    setError("");
    try { if (await deleteDoc(kind, id, no, extra)) onChanged?.(); } catch (e: any) { setError(e.message); }
  }

  const prevDueFor = (b: Bill) => myBills.filter((x) => x.status === "active" && x.id !== b.id && x.bill_date < b.bill_date).reduce((n, x) => n + Math.max(0, billBalance(x, myPays).balance), 0);
  const printBill = (b: Bill) => openPrint(`Bill ${b.bill_no}`, [billHtml(b, pc, prevDueFor(b))]);
  const printReceipt = (p: Payment) => { const b = myBills.find((x) => x.id === p.bill_id)!; openPrint(`Receipt ${p.receipt_no}`, [receiptHtml(p, b, pc, myPays)]); };
  const printSelected = () => {
    const ps = myPays.filter((p) => sel.has(p.id));
    openPrint(`Receipts ${label(flat)}`, ps.map((p) => receiptHtml(p, myBills.find((x) => x.id === p.bill_id)!, pc, myPays)));
  };
  const printStatement = () => openPrint(`Ledger ${label(flat)}`, [statementHtml(flat, myBills, myPays, pc)]);
  const waReceipt = (p: Payment) => waLink(mobile, `Aakar Co-op Housing Society: Received ₹${inr(p.amount)} from Flat ${label(flat)} on ${dmy(p.paid_on)} (${p.mode}). Receipt no. ${p.receipt_no}. Thank you. You can download the receipt in the society app under MY FLAT.`);
  const waBill = (b: Bill) => { const bal = billBalance(b, myPays).balance; return waLink(mobile, `Aakar Co-op Housing Society: Bill ${b.bill_no} for Flat ${label(flat)}${b.period_from ? `, maintenance ${dmy(b.period_from)} – ${dmy(b.period_to)}` : ""}, ₹${inr(b.amount)}${b.due_date ? `, due ${dmy(b.due_date)}` : ""}. Balance due ₹${inr(bal)}. You can view and download it in the society app under MY FLAT.`); };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const tag = (b: Bill, bal: number) => b.status === "cancelled" ? <span className="tag bg-red-50 text-red-700">CANCELLED</span>
    : bal <= 0 ? <span className="tag bg-emerald-50 text-emerald-700">PAID</span>
    : bal < num(b.amount) ? <span className="tag bg-amber-50 text-amber-700">PART</span> : <span className="tag bg-red-50 text-red-700">DUE</span>;
  const modeCell = (p: Payment) => <><span className="mono text-[9px] font-bold border border-[var(--border)] bg-white px-1.5 py-0.5 mr-1.5">{p.mode.toUpperCase()}</span><span className="opacity-60 text-[10.5px] inline-block max-w-[150px] truncate align-middle" title={[p.bank, p.ref].filter(Boolean).join(" • ")}>{[p.bank, p.ref].filter(Boolean).join(" • ")}</span></>;
  const rcptCell = (p: Payment) => (
    <div className="flex items-center gap-1.5">
      {editable && p.status === "active" && <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />}
      <button onClick={() => printReceipt(p)} className={`mono text-[10px] font-bold underline whitespace-nowrap ${p.status === "cancelled" ? "line-through text-red-700" : "text-[var(--navy)]"}`} title="Print receipt">{p.receipt_no}</button>
      {p.status === "active" && mobile && <a href={waReceipt(p)} target="_blank" rel="noopener noreferrer" title="Send on WhatsApp" className="text-[13px]">📲</a>}
      {editable && p.status === "active" && <button onClick={() => cancelPayment(p)} title="Cancel this receipt" className="text-red-600 text-[11px]">✕</button>}
      {canDelete && <button onClick={() => del("receipt", p.id, p.receipt_no, `₹${inr(p.amount)} received ${dmy(p.paid_on)}. The bill balance goes back up.`)} title="Delete this receipt permanently (main admin)" className="text-[12px] opacity-70 hover:opacity-100">🗑</button>}
    </div>
  );

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px]">
      <div className="flex flex-wrap justify-between gap-4 p-5">
        <div>
          <div className="mono text-[10px] tracking-[0.18em] opacity-60">MEMBER LEDGER CARD</div>
          <div className="serif text-[32px] font-bold leading-none mt-1 text-[var(--navy)]">{label(flat)}</div>
          <div className="text-[12.5px] mt-1.5 opacity-80"><b>{flat.owner_name || "Owner not recorded"}</b>{flat.occupancy === "tenant" && flat.tenant_name ? ` • Tenant: ${flat.tenant_name}` : ""} • Tower {flat.tower}, Floor {flat.floor} • Maintenance ₹{inr(flat.maintenance)}/year{mobile ? ` • ${mobile}` : ""}</div>
          {nav && <div className="flex gap-2 mt-3">{nav}</div>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[["TOTAL BILLED", `₹${inr(t.billed)}`, ""], ["TOTAL RECEIVED", `₹${inr(t.received)}`, ""], ["BALANCE DUE", t.due > 0 ? `₹${inr(t.due)}` : "NIL", t.due > 0 ? "due" : "ok"],
            ["LAST PAYMENT", lastPay ? dmy(lastPay.paid_on) : "—", ""]].map(([k, v, c]) => (
            <div key={k} className={`border p-2.5 min-w-[130px] ${c === "due" ? "border-amber-300 bg-amber-50" : "border-[var(--border)] bg-[var(--bg)]"}`}>
              <div className="mono text-[9px] tracking-[0.14em] opacity-60">{k}</div>
              <div className={`serif text-[18px] font-bold mt-0.5 ${c === "due" ? "text-amber-700" : c === "ok" ? "text-emerald-700" : "text-[var(--navy)]"}`}>{v}</div>
              {k === "LAST PAYMENT" && lastPay && <div className="mono text-[9px] opacity-60">₹{inr(lastPay.amount)} • {lastPay.mode}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-2 px-5 py-2.5 border-y border-[var(--border)] bg-[var(--bg-soft)] mono text-[11px]">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} /> Show settled bills ({settledCount})</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={printStatement} className="btn-line px-3 py-1.5">{editable ? "PRINT LEDGER" : "PRINT MY LEDGER"}</button>
          <SharePdfButton className="btn-line px-3 py-1.5" make={() => statementPdf(flat, myBills, myPays, pc)}
            text={`Aakar Co-op Housing Society: ledger statement for Flat ${label(flat)} as on ${dmy(today())}.`} />
          {editable && <button onClick={printSelected} disabled={!sel.size} className="btn-line px-3 py-1.5 disabled:opacity-40">PRINT SELECTED RECEIPTS ({sel.size})</button>}
        </div>
      </div>
      {error && <div className="mx-5 mt-3 border border-red-200 bg-red-50 text-red-700 p-2.5 mono text-[11px]">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[860px]">
          <thead><tr className="bg-[var(--navy)] text-white mono text-[10px] tracking-[0.08em] text-left">
            {["BILL DATE", "BILL NO.", "PERIOD / DESCRIPTION", "BILL ₹", "RECEIVED ₹", "RECEIPT", "RECD. DATE", "MODE / BANK / REF.", "BALANCE ₹", "STATUS"].map((h, i) =>
              <th key={h} className={`px-2 py-2 font-bold whitespace-nowrap ${[3, 4, 8].includes(i) ? "text-right" : ""}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {shown.map((b) => {
              const ps = myPays.filter((p) => p.bill_id === b.id && (showCancelled || p.status === "active")).sort((a, z) => a.paid_on.localeCompare(z.paid_on) || a.created_at.localeCompare(z.created_at));
              const { balance } = billBalance(b, myPays);
              const settled = b.status === "active" && balance <= 0;
              let run = num(b.amount);
              const runAfter = ps.map((p) => (p.status === "active" ? (run = Math.round((run - num(p.amount)) * 100) / 100) : null));
              const desc = b.period_from ? shortPeriod(b.period_from, b.period_to!) : b.lines?.[0]?.description || "";
              const first = ps[0];
              return (
                <Fragment key={b.id}>
                  <tr className={`border-t-2 border-[#d9cfb4] ${b.status === "cancelled" ? "opacity-50" : settled ? "text-[#8b8676]" : "bg-white"}`}>
                    <td className="px-2.5 py-2 whitespace-nowrap">{dmy(b.bill_date)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap"><button onClick={() => printBill(b)} title="Print bill" className={`font-bold underline ${b.status === "cancelled" ? "line-through" : "text-[var(--navy)]"}`}>{b.bill_no}</button>
                      {editable && b.status === "active" && mobile && <a href={waBill(b)} target="_blank" rel="noopener noreferrer" title="Send bill on WhatsApp" className="ml-1.5">📲</a>}</td>
                    <td className="px-2.5 py-2">{b.kind === "other" && <span className="tag bg-[var(--bg-soft)] mr-1.5">OTHER</span>}{b.tenant_bill && <span className="tag bg-amber-100 text-amber-900 mr-1.5" title="Raised to the tenant; not part of the owner's balance">TENANT – BOOKING</span>}{desc}{b.status === "cancelled" && b.cancel_reason && <div className="mono text-[10px] text-red-700">Cancelled: {b.cancel_reason}</div>}</td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{inr(b.amount)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{first ? <span className={first.status === "cancelled" ? "line-through text-red-700" : ""}>{inr(first.amount)}</span> : <span className="opacity-40">—</span>}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      {first ? rcptCell(first) : editable && b.status === "active" && balance > 0 ? <button onClick={() => startEntry(b)} className="btn-navy mono text-[10px] px-2.5 py-1">+ RECORD PAYMENT</button> : null}
                      {editable && b.status === "active" && !first && <button onClick={() => cancelBill(b)} className="ml-2 text-red-600 mono text-[10px] underline">cancel bill</button>}
                      {canDelete && !first && <button onClick={() => del("bill", b.id, b.bill_no, `₹${inr(b.amount)}, Flat ${label(flat)}.`)} title="Delete this bill permanently (main admin)" className="ml-2 text-red-700 mono text-[10px] underline">🗑 delete</button>}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{first ? dmy(first.paid_on) : <span className="opacity-40">—</span>}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{first ? modeCell(first) : <span className="opacity-40">—</span>}</td>
                    <td className={`px-2.5 py-2 text-right font-bold tabular-nums ${b.status === "cancelled" ? "" : ps.length > 1 ? "" : balance > 0 ? (first ? "text-amber-700" : "text-red-700") : "text-emerald-700"}`}>
                      {b.status === "cancelled" ? "—" : ps.length > 1 ? <span className="opacity-50 font-normal">{runAfter[0] != null ? inr(runAfter[0]) : ""}</span> : inr(first ? (runAfter[0] ?? balance) : balance)}</td>
                    <td className="px-2.5 py-2">{ps.length > 1 ? null : tag(b, balance)}</td>
                  </tr>
                  {ps.slice(1).map((p, k) => (
                    <tr key={p.id} className={`bg-[var(--bg)] ${settled ? "text-[#8b8676]" : ""}`}>
                      <td colSpan={3} className="px-2.5 py-2 pl-6 text-[11px] opacity-70">↳ {k === 0 ? "2nd" : k === 1 ? "3rd" : `${k + 2}th`} payment against {b.bill_no}{p.status === "cancelled" && p.cancel_reason ? ` • cancelled: ${p.cancel_reason}` : ""}</td>
                      <td></td>
                      <td className={`px-2.5 py-2 text-right tabular-nums ${p.status === "cancelled" ? "line-through text-red-700" : ""}`}>{inr(p.amount)}</td>
                      <td className="px-2.5 py-2">{rcptCell(p)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{dmy(p.paid_on)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{modeCell(p)}</td>
                      <td className={`px-2.5 py-2 text-right font-bold tabular-nums ${k === ps.length - 2 ? (balance > 0 ? "text-amber-700" : "text-emerald-700") : "opacity-60 font-normal"}`}>{runAfter[k + 1] != null ? inr(runAfter[k + 1]) : ""}</td>
                      <td className="px-2.5 py-2">{k === ps.length - 2 ? tag(b, balance) : null}</td>
                    </tr>
                  ))}
                  {first && editable && b.status === "active" && balance > 0 && entryFor !== b.id && (
                    <tr className="bg-[var(--bg)]"><td colSpan={5}></td><td className="px-2.5 py-1.5"><button onClick={() => startEntry(b)} className="btn-navy mono text-[10px] px-2.5 py-1">+ RECORD PAYMENT</button></td><td colSpan={4}></td></tr>
                  )}
                  {entryFor === b.id && (
                    <tr className="bg-[#fffbea] border-y-2 border-[var(--gold)]">
                      <td colSpan={3} className="px-2.5 py-2 pl-6 font-bold text-[var(--navy)] text-[12px]">↳ Record payment against {b.bill_no}<div className="mono text-[10px] opacity-60 font-normal">due ₹{inr(balance)}</div></td>
                      <td colSpan={7} className="px-2.5 py-2">
                        <div className="flex flex-wrap gap-2 items-center mono text-[11px]">
                          <input className="field !w-[100px] text-right" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" />
                          <input className="field !w-[140px]" type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
                          <select className="field !w-[95px]" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
                          <input className="field !w-[110px]" placeholder="Bank" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
                          <input className="field !w-[150px]" placeholder={form.mode === "Cheque" ? "Cheque no. *" : "UTR / ref."} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
                          {signers.length > 0 && <select className="field !w-[150px]" value={form.signer} onChange={(e) => setForm({ ...form, signer: e.target.value })} title="Receipt signed by">
                            <option value="">No signature</option>{signers.map((s) => <option key={s.id} value={s.id}>{s.designation} – {s.name}</option>)}</select>}
                          <button onClick={() => savePayment(b)} disabled={busy} className="btn-navy px-3 py-1.5 font-bold">{busy ? "SAVING…" : "SAVE & MAKE RECEIPT"}</button>
                          <button onClick={() => setEntryFor(null)} className="btn-line px-3 py-1.5">CANCEL</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={10} className="px-5 py-6 text-center mono text-[11px] opacity-60">{myBills.length ? "All bills are settled. Tick “Show settled bills” to see them." : "No bills yet."}</td></tr>}
            <tr className="bg-[var(--bg-soft)] font-bold">
              <td colSpan={3} className="px-2.5 py-2 text-[var(--navy)]">TOTAL • {myBills.filter((b) => b.status === "active").length} bills, {myPays.filter((p) => p.status === "active").length} payments</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{inr(t.billed)}</td><td className="px-2.5 py-2 text-right tabular-nums">{inr(t.received)}</td>
              <td colSpan={3}></td><td className={`px-2.5 py-2 text-right tabular-nums ${t.due > 0 ? "text-amber-700" : "text-emerald-700"}`}>{t.due > 0 ? inr(t.due) : "NIL"}</td><td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 mono text-[10px] opacity-60 flex flex-wrap justify-between gap-2">
        <span>Click a bill number or a receipt number (RECEIPT column) to view and print it.{editable ? " 📲 sends a WhatsApp message to the member's mobile." : ""}</span>
        {editable && <span>{canDelete ? "Real documents: cancel with a reason. 🗑 deletes test entries permanently (delete a bill's receipts first)." : "A wrong entry is cancelled with a reason. Only the main admin can delete."}</span>}
      </div>
    </div>
  );
}
