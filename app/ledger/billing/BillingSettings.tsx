"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { COMMITTEE_ROLES } from "@/lib/society";
import { cleanImage, DEFAULT_STAMP, docNo, type Settings, type Signatory } from "@/lib/billing";

export default function BillingSettings({ settings, signatories, email, onChanged }: { settings: Settings; signatories: Signatory[]; email: string; onChanged: () => void }) {
  const [s, setS] = useState<Settings>(settings);
  const [msg, setMsg] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [ns, setNs] = useState({ name: "", designation: "Secretary" }); const [nsImg, setNsImg] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Partial<Settings>>({}); // typed but not yet saved
  useEffect(() => setS({ ...settings, ...dirty }), [settings]); // keep unsaved typing when other parts reload
  const set = (k: keyof Settings, v: any) => { setS((x) => ({ ...x, [k]: v })); setDirty((d) => ({ ...d, [k]: v })); };

  async function save() {
    setBusy(true); setError(""); setMsg("");
    const n = (v: any) => Math.max(0, parseInt(String(v), 10) || 0);
    const upd: any = {
      bill_prefix: s.bill_prefix, bill_last_no: n(s.bill_last_no), other_prefix: s.other_prefix, other_last_no: n(s.other_last_no),
      rcpt_prefix: s.rcpt_prefix, rcpt_last_no: n(s.rcpt_last_no), num_digits: Math.min(8, Math.max(1, n(s.num_digits))), due_days: n(s.due_days),
      account_name: s.account_name || null, bank_name: s.bank_name || null, bank_branch: s.bank_branch || null, account_no: s.account_no || null,
      ifsc: (s.ifsc || "").toUpperCase() || null, upi_id: s.upi_id || null, cheque_payee: s.cheque_payee || null, pay_note: s.pay_note || null,
      bill_signer: s.bill_signer || null, rcpt_signer: s.rcpt_signer || null, updated_by: email, updated_at: new Date().toISOString(),
    };
    if ("letter_prefix" in settings) { upd.letter_prefix = s.letter_prefix || "AKR/L/"; upd.letter_last_no = n(s.letter_last_no); }
    const { error } = await supabase.from("billing_settings").update(upd).eq("id", 1);
    setBusy(false);
    if (error) setError(error.message); else { setDirty({}); setMsg("Saved."); onChanged(); }
  }
  async function pickImage(file: File | undefined, then: (url: string) => void) {
    if (!file) return; setError("");
    try { then(await cleanImage(file)); } catch (e: any) { setError(e.message); }
  }
  async function saveStamp(url: string | null) {
    const { error } = await supabase.from("billing_settings").update({ stamp_image: url, updated_by: email, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) setError(error.message); else onChanged();
  }
  async function addSignatory() {
    if (!ns.name.trim()) { setError("Enter the signatory's name."); return; }
    const { error } = await supabase.from("signatories").insert([{ name: ns.name.trim(), designation: ns.designation, signature_image: nsImg, created_by: email }]);
    if (error) { setError(error.message); return; }
    setNs({ name: "", designation: "Secretary" }); setNsImg(null); onChanged();
  }
  async function updSignatory(id: string, upd: any) {
    const { error } = await supabase.from("signatories").update(upd).eq("id", id);
    if (error) setError(error.message); else onChanged();
  }

  const F = ({ k, l, w = "", ph = "" }: { k: keyof Settings; l: string; w?: string; ph?: string }) => (
    <label className={`text-[10px] opacity-80 ${w}`}>{l}<input className="field mt-1" placeholder={ph} value={(s[k] as any) ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const series = (title: string, p: keyof Settings, n: keyof Settings) => (
    <div className="border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="text-[10px] font-bold tracking-[0.14em]">{title}</div>
      <div className="grid grid-cols-[1fr_110px] gap-2 mt-2">
        <label className="text-[10px] opacity-80">PREFIX<input className="field mt-1" value={(s[p] as any) || ""} onChange={(e) => set(p, e.target.value)} /></label>
        <label className="text-[10px] opacity-80">LAST NO. USED<input className="field mt-1 text-right" inputMode="numeric" value={(s[n] as any) ?? 0} onChange={(e) => set(n, e.target.value.replace(/\D/g, ""))} /></label>
      </div>
      <div className="text-[11px] mt-2">Next number: <b className="text-[var(--navy)]">{docNo(String(s[p] || ""), (parseInt(String(s[n]), 10) || 0) + 1, Number(s.num_digits) || 4)}</b></div>
    </div>
  );

  return (
    <div className="space-y-4 mono text-[11px]">
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3">{error}</div>}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-5">
        <div className="serif text-[18px] font-bold">Numbering</div>
        <div className="opacity-60 mt-0.5">Enter the last number already used on paper. The app continues from the next one. Change the prefix at the start of each financial year (e.g. AKR/27-28/).</div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
          {series("MAINTENANCE BILLS", "bill_prefix", "bill_last_no")}
          {series("OTHER (ONE-OFF) BILLS", "other_prefix", "other_last_no")}
          {series("RECEIPTS", "rcpt_prefix", "rcpt_last_no")}
          {"letter_prefix" in settings && series("LETTERS", "letter_prefix", "letter_last_no")}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <label className="text-[10px] opacity-80">DIGITS IN NUMBER<input className="field mt-1 !w-[90px]" inputMode="numeric" value={s.num_digits} onChange={(e) => set("num_digits", e.target.value.replace(/\D/g, ""))} /></label>
          <label className="text-[10px] opacity-80">DUE DATE = BILL DATE +<input className="field mt-1 !w-[90px]" inputMode="numeric" value={s.due_days} onChange={(e) => set("due_days", e.target.value.replace(/\D/g, ""))} /> days</label>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] p-5">
        <div className="serif text-[18px] font-bold">Society bank details</div>
        <div className="opacity-60 mt-0.5">Printed on every bill so members can pay by transfer.</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
          {F({ k: "account_name", l: "ACCOUNT NAME", ph: "Aakar Co-op Housing Society Ltd.", })}
          {F({ k: "bank_name", l: "BANK", ph: "e.g. Bank of Baroda", })}
          {F({ k: "bank_branch", l: "BRANCH", ph: "e.g. Naranpura", })}
          {F({ k: "account_no", l: "ACCOUNT NO.", })}
          {F({ k: "ifsc", l: "IFSC", })}
          {F({ k: "upi_id", l: "UPI ID (optional)", })}
          {F({ k: "cheque_payee", l: "CHEQUE IN FAVOUR OF", ph: "Aakar Co-op Housing Society Ltd.", w: "sm:col-span-2", })}
          {F({ k: "pay_note", l: "NOTE ON BILLS (optional)", ph: "Kindly pay by the due date…", w: "lg:col-span-3 sm:col-span-2", })}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] p-5">
        <div className="serif text-[18px] font-bold">Authorised signatories</div>
        <div className="opacity-60 mt-0.5">Sign on plain white paper with dark ink, take a clear photo and upload it. The paper background is removed automatically.</div>
        <div className="mt-3 space-y-2">
          {signatories.map((g) => (
            <div key={g.id} className={`border border-[var(--border)] p-3 flex flex-wrap items-center gap-3 ${g.active ? "bg-white" : "bg-[var(--bg)] opacity-60"}`}>
              <div className="h-14 w-40 border border-dashed border-[var(--border)] grid place-items-center bg-white">{g.signature_image ? <img src={g.signature_image} alt="" className="max-h-12 max-w-[150px]" /> : <span className="opacity-40">no signature</span>}</div>
              <div className="flex-1 min-w-[150px]"><div className="serif text-[14px] font-bold">{g.name}</div><div className="opacity-70">{g.designation}{!g.active ? " • not active" : ""}</div></div>
              <label className="btn-line px-2.5 py-1 cursor-pointer">{g.signature_image ? "REPLACE SIGNATURE" : "UPLOAD SIGNATURE"}<input type="file" hidden accept="image/*" onChange={(e) => pickImage(e.target.files?.[0], (u) => updSignatory(g.id, { signature_image: u }))} /></label>
              <button onClick={() => updSignatory(g.id, { active: !g.active })} className="underline">{g.active ? "Make inactive" : "Make active"}</button>
            </div>
          ))}
          {signatories.length === 0 && <div className="opacity-60">No signatories yet.</div>}
        </div>
        <div className="mt-3 border border-[var(--gold)] bg-[#fffdf5] p-3 flex flex-wrap items-end gap-2">
          <label className="text-[10px] opacity-80">NAME<input className="field mt-1 !w-[200px]" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} /></label>
          <label className="text-[10px] opacity-80">DESIGNATION<select className="field mt-1 !w-[170px]" value={ns.designation} onChange={(e) => setNs({ ...ns, designation: e.target.value })}>{COMMITTEE_ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="btn-line px-3 py-2 cursor-pointer">{nsImg ? "✓ SIGNATURE READY" : "SIGNATURE PHOTO"}<input type="file" hidden accept="image/*" onChange={(e) => pickImage(e.target.files?.[0], setNsImg)} /></label>
          {nsImg && <img src={nsImg} alt="" className="h-10 border border-[var(--border)] bg-white" />}
          <button onClick={addSignatory} className="btn-navy px-4 py-2">+ ADD SIGNATORY</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          {([["bill_signer", "BILLS SIGNED BY (DEFAULT)"], ["rcpt_signer", "RECEIPTS SIGNED BY (DEFAULT)"]] as const).map(([k, l]) => (
            <label key={k} className="text-[10px] opacity-80">{l}<select className="field mt-1" value={(s[k] as any) || ""} onChange={(e) => set(k, e.target.value || null)}>
              <option value="">— none (blank signature line) —</option>{signatories.filter((g) => g.active).map((g) => <option key={g.id} value={g.id}>{g.designation} – {g.name}</option>)}</select></label>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] p-5 flex flex-wrap gap-5 items-center">
        <div className="h-28 w-28 grid place-items-center bg-white border border-[var(--border)]"><img src={s.stamp_image || DEFAULT_STAMP} alt="Society stamp" className="max-h-24 max-w-24" /></div>
        <div className="flex-1 min-w-[220px]">
          <div className="serif text-[18px] font-bold">Society stamp</div>
          <div className="opacity-60 mt-0.5">{s.stamp_image ? "Using the uploaded stamp." : "Using the built-in round blue stamp. Upload a photo of the real stamp on white paper to use it instead."}</div>
          <div className="flex gap-2 mt-2">
            <label className="btn-line px-3 py-1.5 cursor-pointer">UPLOAD STAMP PHOTO<input type="file" hidden accept="image/*" onChange={(e) => pickImage(e.target.files?.[0], (u) => saveStamp(u))} /></label>
            {s.stamp_image && <button onClick={() => saveStamp(null)} className="underline">Use built-in stamp</button>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {Object.keys(dirty).length > 0 && <span className="text-amber-700 font-bold">Unsaved changes</span>}
        <button onClick={save} disabled={busy} className="btn-navy px-6 py-2.5 tracking-[0.1em]">{busy ? "SAVING…" : "SAVE SETTINGS"}</button>
        {msg && <span className="text-emerald-700 font-bold">{msg}</span>}
      </div>
    </div>
  );
}
