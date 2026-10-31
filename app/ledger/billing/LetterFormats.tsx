"use client";
// BILLING → LETTERS → LETTER FORMATS (committee): the society's standard letters. Members choose one when they ask for a
// letter; the committee's draft is filled from the flat's records. "Bank" formats are issued unsigned (signed by hand).
// Formats are switched off, never deleted.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fillTemplate, letterData, TEMPLATE_FIELDS, type LetterTemplate } from "@/lib/letterTemplates";
import { SOCIETY } from "@/lib/society";

type Form = { id?: string; name: string; kind: "general" | "bank" | "resolution"; subject: string; addressee: string; body: string; sort: string };
const BLANK: Form = { name: "", kind: "general", subject: "", addressee: "", body: "", sort: "100" };
const SAMPLE = { id: "A101", tower: "A", floor: 1, owner_name: "SAMPLE OWNER", share_cert_no: "123", member_since: "2001-04-01" };

export default function LetterFormats({ list, email, onChanged }: { list: LetterTemplate[]; email: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  async function save() {
    if (!form) return;
    if (form.name.trim().length < 2 || !form.subject.trim() || !form.body.trim()) { setError("Name, subject and letter text are needed."); return; }
    setBusy(true); setError("");
    const row = { name: form.name.trim(), kind: form.kind, subject: form.subject.trim(), addressee: form.addressee.trim() || null, body: form.body,
      sort: parseInt(form.sort, 10) || 100, updated_by: email, updated_at: new Date().toISOString() };
    const { error } = form.id ? await supabase.from("letter_templates").update(row).eq("id", form.id) : await supabase.from("letter_templates").insert({ ...row, created_by: email });
    setBusy(false);
    if (error) { setError(/duplicate|unique/i.test(error.message) ? "A format with this name already exists." : error.message); return; }
    setForm(null); onChanged();
  }
  async function setActive(t: LetterTemplate, active: boolean) {
    const { error } = await supabase.from("letter_templates").update({ active, updated_by: email, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (error) setError(error.message); else onChanged();
  }
  const sample = form ? fillTemplate(form.body, letterData(SAMPLE, { addressee: form.addressee, purpose: "", dues: 0, society: SOCIETY.full, building: SOCIETY.building })) : "";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-4 mono text-[12px]">
      <div className="flex flex-wrap justify-between gap-2 items-center">
        <div><div className="font-bold tracking-[0.12em] text-[11px]">LETTER FORMATS • {list.filter((t) => t.active).length} IN USE</div>
          <div className="opacity-60 text-[11px]">The society's standard letters. Members choose one when they ask; your draft is filled in from the flat's records.</div></div>
        <button onClick={() => setOpen((v) => !v)} className="btn-line px-3 min-h-[44px]">{open ? "HIDE" : "SHOW FORMATS"}</button>
      </div>
      {open && <div className="mt-3 space-y-2">
        {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}
        {!form && <button onClick={() => { setForm({ ...BLANK }); setError(""); }} className="btn-navy px-4 min-h-[44px]">+ NEW FORMAT</button>}
        {form && (
          <div className="border-2 border-[var(--gold)] bg-[#fffdf5] p-3 space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-[10px] opacity-80 min-w-0">NAME (what members choose) *<input className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. NOC for bank loan" /></label>
              <label className="text-[10px] opacity-80 min-w-0">KIND<select className="field mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Form["kind"] })}>
                <option value="general">General (signed &amp; stamped as usual)</option><option value="bank">Bank letter (issued UNSIGNED, signed by hand)</option>
                <option value="resolution">Committee resolution (signed by hand by the committee; issued by the Chairman / Secretary)</option></select></label>
              <label className="text-[10px] opacity-80 min-w-0">SUBJECT *<input className="field mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
              <label className="text-[10px] opacity-80 min-w-0">USUALLY ADDRESSED TO (blank = to whomsoever it may concern)<input className="field mt-1" value={form.addressee} onChange={(e) => setForm({ ...form, addressee: e.target.value })} /></label>
              <label className="text-[10px] opacity-80 min-w-0">ORDER<input className="field mt-1 !w-[90px]" inputMode="numeric" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value.replace(/\D/g, "") })} /></label>
            </div>
            <label className="text-[10px] opacity-80 block">LETTER TEXT * <span className="opacity-60">(empty line between paragraphs; fields in double braces are filled in)</span>
              <textarea className="field mt-1 !h-auto font-sans text-[13px] leading-relaxed" rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
            <div className="text-[10.5px] opacity-80 mb-1">Any other word in double braces (for example <b>{"{{transferee_name}}"}</b>, <b>{"{{meeting_date}}"}</b>, <b>{"{{fee_amount}}"}</b>) becomes a box to fill in when the letter is issued: a name ending <b>_date</b> gets a date box, <b>_amount</b> an amount box, and <b>_words</b> is worked out from the matching <b>_amount</b>.</div>
            <div className="text-[10.5px] opacity-80">Fields: {TEMPLATE_FIELDS.map((f) => <button key={f.key} type="button" title={f.what} onClick={() => setForm({ ...form, body: `${form.body}{{${f.key}}}` })} className="underline mr-2">{`{{${f.key}}}`}</button>)}</div>
            {form.body.trim() && <div className="border border-[var(--border)] bg-white p-2 text-[12px] whitespace-pre-wrap font-sans"><div className="mono text-[10px] opacity-60 mb-1">SAMPLE (sample flat)</div>{sample}</div>}
            <div className="flex flex-wrap gap-2">
              <button onClick={save} disabled={busy} className="btn-navy px-4 min-h-[44px]">{busy ? "SAVING…" : "SAVE FORMAT"}</button>
              <button onClick={() => { setForm(null); setError(""); }} className="btn-line px-4 min-h-[44px]">CANCEL</button>
            </div>
          </div>)}
        <div className="grid gap-2 lg:grid-cols-2">
          {list.map((t) => (
            <div key={t.id} className={`border p-3 min-w-0 ${t.active ? "border-[var(--border)] bg-white" : "border-dashed border-gray-300 bg-gray-50 opacity-70"}`}>
              <div className="flex justify-between gap-2"><b className="break-words">{t.name}</b>
                <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-bold ${t.kind === "bank" ? "border-red-200 bg-red-50 text-red-700" : t.kind === "resolution" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-[var(--border)]"}`}>{t.kind === "bank" ? "BANK • UNSIGNED" : t.kind === "resolution" ? "RESOLUTION" : "GENERAL"}</span></div>
              <div className="text-[11px] opacity-70 mt-0.5 break-words">Subject: {t.subject}{t.addressee ? ` • To: ${t.addressee}` : ""}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                <button onClick={() => { setForm({ id: t.id, name: t.name, kind: t.kind, subject: t.subject, addressee: t.addressee || "", body: t.body, sort: String(t.sort) }); setError(""); }} className="underline min-h-[32px]">edit</button>
                {t.active ? <button onClick={() => setActive(t, false)} className="underline text-red-700 min-h-[32px]">switch off</button>
                  : <button onClick={() => setActive(t, true)} className="underline text-emerald-700 min-h-[32px]">switch on</button>}
              </div>
            </div>))}
        </div>
      </div>}
    </div>
  );
}
