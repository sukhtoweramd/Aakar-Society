"use client";
// Letters for one flat ("To whomsoever it may concern", NOC…): committee issues and cancels; the flat's members view and print.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, type Flat } from "@/lib/society";
import { dmy, letterHtml, letterPdf, loadSettings, loadSignatories, openPrint, reserveNumbers, today, type Letter, type PrintCtx } from "@/lib/billing";
import SharePdfButton from "./SharePdfButton";
import { deleteDoc, useMainAdmin } from "@/lib/docDelete";

const TO_ALL = "TO WHOMSOEVER IT MAY CONCERN";

/** prefill: open the form already filled in (from a member's letter request); onIssued: told the new letter after it is issued. */
export default function LettersPanel({ flat, flats, isCommittee, email, onChanged, prefill, onIssued }: {
  flat: Flat; flats: Flat[]; isCommittee: boolean; email: string; onChanged?: () => void;
  prefill?: { key: string; subject: string; to: string; body?: string; unsigned?: boolean; requestId?: string }; onIssued?: (l: Letter) => void }) {
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [pc, setPc] = useState<PrintCtx>({ settings: null, signatories: [], flats });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const blank = () => ({ letter_date: today(), owner_name: flat.owner_name || "", kind: "all" as "all" | "third", to: "", subject: "", body: "", signer: "" });
  const [form, setForm] = useState(blank());
  const canDelete = useMainAdmin(isCommittee);

  async function load() {
    const [l, s, sg] = await Promise.all([
      supabase.from("letters").select("*").eq("flat_id", flat.id).order("letter_date", { ascending: false }).order("created_at", { ascending: false }),
      loadSettings(), loadSignatories(),
    ]);
    if (l.error) { setMissing(/letters/.test(l.error.message)); setLetters([]); return; }
    setLetters((l.data as Letter[]) || []);
    setPc({ settings: s, signatories: sg, flats });
    const sec = sg.find((g) => g.active && /secretary/i.test(g.designation)) || sg.find((g) => g.active && g.id === s?.bill_signer) || sg.find((g) => g.active);
    setForm((f) => ({ ...f, signer: f.signer || sec?.id || "" }));
  }
  useEffect(() => { load(); setOpen(false); setForm(blank()); }, [flat.id]);
  useEffect(() => {
    if (!prefill || !isCommittee) return;
    setOpen(true); setError("");
    setForm((f) => ({ ...f, subject: prefill.subject, kind: prefill.to.trim() ? "third" : "all", to: prefill.to, body: prefill.body ?? f.body, signer: prefill.unsigned ? "" : f.signer }));
  }, [prefill?.key]);

  const signers = pc.signatories.filter((g) => g.active);
  const draft = (ref: string): Letter => {
    const g = signers.find((x) => x.id === form.signer);
    const unsigned = !!prefill?.unsigned;
    return { id: "draft", ref_no: ref, flat_id: flat.id, unsigned, request_id: prefill?.requestId || null, letter_date: form.letter_date, owner_name: form.owner_name.trim() || null, addressee: form.kind === "third" ? form.to.trim() : TO_ALL,
      subject: form.subject.trim(), body: form.body, signer_id: unsigned ? null : g?.id || null, signer_name: unsigned ? null : g?.name || null, signer_designation: unsigned ? null : g?.designation || null,
      status: "active", cancel_reason: null, created_by: email, created_at: new Date().toISOString() };
  };
  const check = () => (form.kind === "third" && !form.to.trim() ? "Enter who the letter is addressed to (name and address)." : !form.subject.trim() ? "Enter the subject." : !form.body.trim() ? "Type the letter text." : !form.letter_date ? "Choose the date." : "");

  function preview() {
    const e = check(); if (e) { setError(e); return; } setError("");
    openPrint("Letter preview (not issued)", [letterHtml(draft("DRAFT – NOT ISSUED"), pc)]);
  }
  async function issue() {
    const e = check(); if (e) { setError(e); return; }
    if (!confirm(`Issue this letter to ${label(flat)}? It gets the next letter number and appears in the member's MY FLAT.`)) return;
    setBusy(true); setError("");
    const w = window.open("", "_blank");
    try {
      const [ref] = await reserveNumbers("letter", 1);
      const { id, ...row } = draft(ref) as any;
      if (!row.unsigned) { delete row.unsigned; }               // older database (LETTER_TEMPLATES.sql not run): plain letter as before
      if (!row.request_id) { delete row.request_id; }
      const { data, error } = await supabase.from("letters").insert([row]).select().single();
      if (error) throw error;
      openPrint(`Letter ${ref}`, [letterHtml(data as Letter, pc)], w);
      onIssued?.(data as Letter);
      setOpen(false); setForm(blank()); await load(); onChanged?.();
    } catch (err: any) { w?.close(); setError(/letter/i.test(err.message || "") && /column|function|series/i.test(err.message) ? "Run LETTERS.sql in Supabase first." : err.message); }
    setBusy(false);
  }
  async function handedOver(l: Letter) {
    if (!confirm(`Letter ${l.ref_no}: the Chairman / Secretary has signed it by hand and it has been given to the member?`)) return;
    const { error } = await supabase.from("letters").update({ handed_over_at: new Date().toISOString(), handed_over_by: email }).eq("id", l.id);
    if (error) setError(error.message); else { load(); onChanged?.(); }
  }
  async function cancel(l: Letter) {
    const why = prompt(`Cancel letter ${l.ref_no}?\nIt stays on record marked CANCELLED.\n\nReason:`);
    if (!why?.trim()) return;
    const { error } = await supabase.from("letters").update({ status: "cancelled", cancel_reason: why.trim(), cancelled_by: email, cancelled_at: new Date().toISOString() }).eq("id", l.id);
    if (error) setError(error.message); else { load(); onChanged?.(); }
  }

  if (letters === null) return null;
  if (missing) return isCommittee ? <div className="border border-amber-200 bg-amber-50 p-3 mono text-[11px]">LETTERS: run LETTERS.sql in Supabase to turn on letters.</div> : null;
  const shown = letters.filter((l) => showCancelled || l.status === "active");
  if (!isCommittee && shown.length === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] mono text-[11px]">
      <div className="flex flex-wrap justify-between items-center gap-3 p-5">
        <div>
          <div className="text-[10px] tracking-[0.18em] opacity-60">{isCommittee ? "LETTERS ISSUED" : "MY LETTERS"}</div>
          <div className="serif text-[20px] font-bold mt-0.5">Letters for {label(flat)}</div>
          <div className="opacity-60 mt-0.5">{letters.filter((l) => l.status === "active").length} issued{isCommittee ? " • signed and stamped • the member sees them in MY FLAT" : " • click a letter number to view and print"}</div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {letters.some((l) => l.status === "cancelled") && <label className="flex items-center gap-1.5"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled</label>}
          {isCommittee && !open && <button onClick={() => { setOpen(true); setError(""); }} className="btn-navy px-4 py-2 tracking-[0.06em]">+ ISSUE LETTER</button>}
        </div>
      </div>
      {error && <div className="mx-5 mb-3 border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}

      {isCommittee && open && (
        <div className="mx-5 mb-5 border-2 border-[var(--gold)] bg-[#fffdf5] p-4 space-y-3">
          <div className="font-bold tracking-[0.1em] text-[#8a6d14]">NEW LETTER • {label(flat)}</div>
          <div className="grid sm:grid-cols-[160px_1fr] gap-3">
            <label className="text-[10px] opacity-80">DATE<input type="date" className="field mt-1" value={form.letter_date} onChange={(e) => setForm({ ...form, letter_date: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">OWNER NAME (AS ON LETTER)<input className="field mt-1" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></label>
          </div>
          <div className="text-[10px] opacity-80">ADDRESSED TO
            <div className="flex flex-wrap gap-4 mt-1.5 text-[12px]">
              <label className="flex items-center gap-1.5"><input type="radio" checked={form.kind === "all"} onChange={() => setForm({ ...form, kind: "all" })} /> To whomsoever it may concern</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={form.kind === "third"} onChange={() => setForm({ ...form, kind: "third" })} /> To a third party (bank, authority, builder…)</label>
            </div></div>
          {form.kind === "third" && <label className="text-[10px] opacity-80 block">TO (NAME AND ADDRESS) * <span className="opacity-60">— one line each</span>
            <textarea className="field mt-1 !h-auto font-sans text-[13px]" rows={4} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder={"The Branch Manager\nHDFC Bank Ltd.\nNaranpura Branch\nAhmedabad – 380013"} /></label>}
          <label className="text-[10px] opacity-80 block">SUBJECT *<input className="field mt-1" placeholder="e.g. No Objection Certificate for home loan" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
          <label className="text-[10px] opacity-80 block">LETTER TEXT * <span className="opacity-60">(leave an empty line between paragraphs)</span>
            <textarea className="field mt-1 !h-auto font-sans text-[13px] leading-relaxed" rows={9} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={"This is to certify that Shri / Smt. … is the owner of Flat … in Sukh Tower, a member of the society …\n\nThe society has no objection to …"} /></label>
          {prefill?.unsigned && <div className="border border-red-300 bg-red-50 text-red-800 p-2">Bank letter: it is issued as an <b>UNSIGNED</b> copy (no signature or stamp printed). Print it; the Chairman or Secretary signs and stamps it by hand and hands it over; then tick SIGNED COPY HANDED OVER in the list below.</div>}
          <div className="flex flex-wrap gap-2 items-end">
            {!prefill?.unsigned && <label className="text-[10px] opacity-80">SIGNED BY<select className="field mt-1 !w-[240px]" value={form.signer} onChange={(e) => setForm({ ...form, signer: e.target.value })}>
              <option value="">— no signature —</option>{signers.map((g) => <option key={g.id} value={g.id}>{g.designation} – {g.name}</option>)}</select></label>}
            <button onClick={preview} className="btn-line px-4 py-2">PREVIEW</button>
            <button onClick={issue} disabled={busy} className="btn-navy px-4 py-2 font-bold">{busy ? "ISSUING…" : "ISSUE & PRINT"}</button>
            <button onClick={() => { setOpen(false); setError(""); }} className="underline px-2 py-2">Cancel</button>
          </div>
          <div className="opacity-60">{form.kind === "all"
            ? <>Prints: reference no. and date, flat number and owner, &quot;{TO_ALL}&quot;, subject, your text, then Yours faithfully, signature, stamp, place and date.</>
            : <>Prints: reference no. and date, &quot;To,&quot; and the address above, subject, &quot;Ref.: Flat No. {label(flat)} — Owner: {form.owner_name || "…"}&quot;, Dear Sir / Madam, your text, then Yours faithfully, signature, stamp, place and date.</>}</div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead><tr className="bg-[var(--navy)] text-white text-left text-[10px] tracking-[0.08em]">
              <th className="px-3 py-2">DATE</th><th className="px-3 py-2">LETTER NO.</th><th className="px-3 py-2">SUBJECT</th><th className="px-3 py-2">SIGNED BY</th><th className="px-3 py-2"></th></tr></thead>
            <tbody>{shown.map((l) => (
              <tr key={l.id} className={`border-b border-[var(--border)] ${l.status === "cancelled" ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">{dmy(l.letter_date)}</td>
                <td className="px-3 py-2 whitespace-nowrap"><button onClick={() => openPrint(`Letter ${l.ref_no}`, [letterHtml(l, pc)])} className={`font-bold underline text-[var(--navy)] ${l.status === "cancelled" ? "line-through" : ""}`} title="View and print">{l.ref_no}</button></td>
                <td className="px-3 py-2">{l.subject}{l.addressee.trim().toUpperCase() !== TO_ALL && <div className="text-[10px] opacity-60">To: {l.addressee.split("\n")[0]}</div>}{l.status === "cancelled" && l.cancel_reason && <div className="text-[10px] text-red-700">Cancelled: {l.cancel_reason}</div>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{l.unsigned
                  ? (l.handed_over_at ? <span className="text-emerald-700">Signed by hand • {isCommittee ? "handed over" : "collected"} {dmy(l.handed_over_at.slice(0, 10))}</span>
                    : <span className="text-red-700 font-bold">{isCommittee ? "UNSIGNED • to sign & hand over" : "READY TO COLLECT (signed copy from the Chairman / Secretary)"}</span>)
                  : l.signer_designation || "—"}
                  {isCommittee && l.unsigned && !l.handed_over_at && l.status === "active" && <button onClick={() => handedOver(l)} className="block mt-1 btn-line px-2 py-1 text-[10px]">SIGNED COPY HANDED OVER</button>}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {l.status === "active" && <SharePdfButton label="📄 PDF" className="underline mr-3" make={() => letterPdf(l, pc)} text={`Aakar Co-op Housing Society: letter ${l.ref_no} for Flat ${label(flat)} — ${l.subject}.`} />}
                  {isCommittee && l.status === "active" && <button onClick={() => cancel(l)} className="text-red-600 underline">cancel</button>}
                  {canDelete && <button onClick={async () => { setError(""); try { if (await deleteDoc("letter", l.id, l.ref_no, l.subject)) load(); } catch (e: any) { setError(e.message); } }} title="Delete permanently (main admin)" className="ml-3 text-red-700 underline">🗑 delete</button>}
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {isCommittee && shown.length === 0 && !open && <div className="px-5 pb-5 opacity-60">No letters issued for this flat yet.</div>}
    </div>
  );
}
