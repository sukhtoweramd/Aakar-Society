"use client";
// MY FLAT → REQUEST A LETTER (members). The request goes to the committee (BILLING → LETTERS); the issued letter
// then appears in MY LETTERS. Phone first.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dmy } from "@/lib/billing";
import { LETTER_TYPES, REQ_STATUS, type LetterRequest } from "@/lib/letterRequests";

export default function LetterRequestPanel({ flatId }: { flatId: string }) {
  const [list, setList] = useState<LetterRequest[] | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(""); const [third, setThird] = useState(false); const [to, setTo] = useState(""); const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState("");

  async function load() {
    const { data, error } = await supabase.from("letter_requests").select("*").eq("flat_id", flatId).order("created_at", { ascending: false });
    setList(error ? (/letter_requests|schema cache|does not exist/i.test(error.message) ? null : []) : (data as LetterRequest[]) || []);
  }
  useEffect(() => { load(); }, [flatId]);
  if (list === undefined || list === null) return null;   // not set up yet → nothing shown to members

  async function send() {
    if (!type) { setErr("Choose which letter you need."); return; }
    if (third && !to.trim()) { setErr("Write who the letter is addressed to (for example the bank and branch)."); return; }
    if (type === "Other" && purpose.trim().length < 5) { setErr("Describe the letter you need."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("letter_requests").insert({ flat_id: flatId, letter_type: type, addressee: third ? to.trim() : null, purpose: purpose.trim() || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(`Request sent: ${type}. The committee will issue it; you will see it below under MY LETTERS.`);
    setOpen(false); setType(""); setThird(false); setTo(""); setPurpose(""); load();
  }
  async function withdraw(r: LetterRequest) {
    if (!confirm(`Withdraw your request for "${r.letter_type}"?`)) return;
    const { error } = await supabase.rpc("withdraw_letter_request", { p_id: r.id });
    if (error) setErr(error.message); else load();
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 mono text-[12px] mb-4">
      <div className="text-[11px] font-bold tracking-[0.16em]">REQUEST A LETTER</div>
      <div className="text-[11px] opacity-60">NOC, address proof, no-dues certificate… The committee issues it, signed and stamped.</div>
      {done && <div className="mt-3 border border-emerald-300 bg-emerald-50 text-emerald-800 p-3">✓ {done} <button onClick={() => setDone("")} className="underline ml-2">OK</button></div>}
      {!open ? <button onClick={() => { setOpen(true); setErr(""); }} className="btn-gold w-full sm:w-auto mt-3 px-5 py-3 tracking-[0.08em]">+ REQUEST A LETTER</button> : (
        <div className="mt-3 border border-[var(--gold)] bg-[#fffdf5] p-3 space-y-3">
          <label className="block"><span className="text-[11px] font-bold">WHICH LETTER? *</span>
            <select className="field mt-1" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Choose…</option>{LETTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <div><span className="text-[11px] font-bold">ADDRESSED TO</span>
            <div className="mt-1 grid gap-2">
              <label className="flex items-center gap-2 border border-[var(--border)] bg-white p-3"><input type="radio" className="h-5 w-5" checked={!third} onChange={() => setThird(false)} /> To whomsoever it may concern</label>
              <label className="flex items-center gap-2 border border-[var(--border)] bg-white p-3"><input type="radio" className="h-5 w-5" checked={third} onChange={() => setThird(true)} /> A bank, office or person</label>
            </div></div>
          {third && <label className="block"><span className="text-[11px] font-bold">TO (NAME AND ADDRESS) *</span>
            <textarea className="field mt-1" rows={3} maxLength={400} placeholder={"The Branch Manager\nSample Bank, Naranpura Branch, Ahmedabad"} value={to} onChange={(e) => setTo(e.target.value)} /></label>}
          <label className="block"><span className="text-[11px] font-bold">PURPOSE / DETAILS {type === "Other" ? "*" : "(optional)"}</span>
            <textarea className="field mt-1" rows={3} maxLength={1000} placeholder="e.g. Home loan of ₹20 lakh from Sample Bank; needed by 5 November" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
          {err && <div className="text-red-700">{err}</div>}
          <div className="flex gap-2">
            <button onClick={send} disabled={busy} className="btn-navy flex-1 sm:flex-none px-5 py-3 font-bold">{busy ? "SENDING…" : "SEND REQUEST"}</button>
            <button onClick={() => { setOpen(false); setErr(""); }} className="btn-line px-4 py-3">CANCEL</button>
          </div>
        </div>)}
      {list.length > 0 && <div className="mt-3 grid gap-2">
        {list.slice(0, 10).map((r) => (
          <div key={r.id} className="border border-[var(--border)] bg-white p-3">
            <div className="flex justify-between gap-2 items-start">
              <div className="min-w-0"><b>{r.letter_type}</b><div className="text-[11px] opacity-60">asked {dmy(r.created_at.slice(0, 10))}{r.addressee ? ` • to ${r.addressee.split("\n")[0]}` : ""}</div></div>
              <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-bold ${REQ_STATUS[r.status].cls}`}>{REQ_STATUS[r.status].text}</span>
            </div>
            {r.status === "issued" && <div className="mt-1 text-[11px] text-emerald-800">The letter is in MY LETTERS below: tap its number to view, print or share.</div>}
            {r.status === "declined" && r.reason && <div className="mt-1 text-[11px] text-red-700">Reason: {r.reason}</div>}
            {r.status === "requested" && <button onClick={() => withdraw(r)} className="mt-2 btn-line px-3 py-2">WITHDRAW</button>}
          </div>))}
      </div>}
    </div>
  );
}
