"use client";
// BILLING → LETTERS: every letter issued to every flat (committee). Search, view / print, open the flat,
// and issue a new letter by choosing the flat (the same form as on the flat's page). Phone first: one card per letter.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, ownerText, type Flat } from "@/lib/society";
import { dmy, letterHtml, openPrint, type Letter, type PrintCtx } from "@/lib/billing";
import { backBar } from "@/lib/printBack";
import LettersPanel from "./LettersPanel";
import { REQ_STATUS, subjectFor, type LetterRequest } from "@/lib/letterRequests";
import { fillTemplate, letterData, type LetterTemplate } from "@/lib/letterTemplates";
import { SOCIETY } from "@/lib/society";
import { flatTotals } from "@/lib/billing";
import LetterFormats from "./LetterFormats";

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function LettersRegister({ flats, pc, email, openFlat, onCount }: { flats: Flat[]; pc: PrintCtx; email: string; openFlat: (id: string) => void; onCount?: (n: number) => void }) {
  const [letters, setLetters] = useState<Letter[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "cancelled" | "all">("active");
  const [issueFor, setIssueFor] = useState("");          // flat chosen for a new letter
  const [requests, setRequests] = useState<LetterRequest[] | null>(null);   // null = LETTER_REQUESTS.sql not run
  const [forReq, setForReq] = useState<LetterRequest | null>(null);         // request being issued
  const [templates, setTemplates] = useState<LetterTemplate[] | null>(null);   // null = LETTER_TEMPLATES.sql not run
  const [canApprove, setCanApprove] = useState(true);                       // Chairman / Secretary / main admin (database decides)
  const [draftBody, setDraftBody] = useState<{ key: string; subject: string; to: string; body: string; unsigned: boolean; requestId: string } | null>(null);
  async function loadTemplates() {
    const { data, error } = await supabase.from("letter_templates").select("*").order("sort").order("name");
    setTemplates(error ? null : (data as LetterTemplate[]) || []);
    const r = await supabase.rpc("can_approve_letters"); setCanApprove(r.error ? true : !!r.data);
  }
  useEffect(() => { loadTemplates(); }, []);
  const tplOf = (r: LetterRequest) => (templates || []).find((t) => t.id === r.template_id) || (templates || []).find((t) => t.name === r.letter_type) || null;
  async function loadRequests() {
    const { data, error } = await supabase.from("letter_requests").select("*").order("created_at", { ascending: true });
    const list = error ? null : (data as LetterRequest[]) || [];
    setRequests(list); onCount?.((list || []).filter((r) => r.status === "requested" || r.status === "approved").length);
  }
  useEffect(() => { loadRequests(); }, []);
  async function startIssue(r: LetterRequest) {
    // draft from the society's format, filled from the flat's records (the committee checks and edits before issuing)
    const t = tplOf(r); const f = flatOf(r.flat_id);
    let body = r.purpose ? `\n\n(Member's request: ${r.purpose})` : "";
    if (t && f) {
      let dues: number | null = null;
      if (/\{\{\s*dues\s*\}\}/.test(t.body)) {
        const [b, p] = await Promise.all([supabase.from("bills").select("*").eq("flat_id", f.id), supabase.from("payments").select("*").eq("flat_id", f.id)]);
        if (!b.error && !p.error) dues = flatTotals((b.data as any[]) || [], (p.data as any[]) || []).due;
      }
      body = fillTemplate(t.body, letterData(f, { addressee: r.addressee || t.addressee, purpose: r.purpose, dues, society: SOCIETY.full, building: SOCIETY.building }));
    }
    setDraftBody({ key: `${r.id}-${Date.now()}`, subject: t?.subject || subjectFor(r), to: r.addressee || t?.addressee || "", body, unsigned: t?.kind === "bank", requestId: r.id });
    setForReq(r); setIssueFor(r.flat_id);
    setTimeout(() => document.getElementById("letter-issue-box")?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  }
  async function markIssued(l: Letter) {
    if (!forReq) return;
    const { error } = await supabase.from("letter_requests").update({ status: "issued", letter_id: l.id, decided_by: email, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", forReq.id);
    if (error) setError(`Letter issued, but the request was not marked: ${error.message}`);
    setForReq(null); loadRequests();
  }
  async function approve(r: LetterRequest) {
    if (!confirm(`Approve "${r.letter_type}" for Flat ${flatOf(r.flat_id) ? label(flatOf(r.flat_id)!) : r.flat_id}? It can then be issued.`)) return;
    const { error } = await supabase.from("letter_requests").update({ status: "approved", decided_by: email, decided_at: new Date().toISOString() }).eq("id", r.id);
    if (error) setError(error.message); else loadRequests();
  }
  async function decline(r: LetterRequest) {
    const why = prompt(`Not issuing "${r.letter_type}" for Flat ${flatOf(r.flat_id) ? label(flatOf(r.flat_id)!) : r.flat_id}?\n\nReason (the member sees it):`, "");
    if (!why?.trim()) return;
    const { error } = await supabase.from("letter_requests").update({ status: "declined", reason: why.trim(), decided_by: email, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) setError(error.message); else loadRequests();
  }
  async function load() {
    const { data, error } = await supabase.from("letters").select("*").order("letter_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) { setError(/letters/.test(error.message) ? "Run LETTERS.sql in Supabase first." : error.message); setLetters([]); return; }
    setLetters((data as Letter[]) || []);
  }
  useEffect(() => { load(); }, []);

  const flatOf = (id: string) => flats.find((f) => f.id === id);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (letters || []).filter((l) => (show === "all" || l.status === show) && (!s || [l.ref_no, l.subject, l.addressee, l.owner_name, l.flat_id, flatOf(l.flat_id) ? label(flatOf(l.flat_id)!) : ""].some((x) => String(x || "").toLowerCase().includes(s))));
  }, [letters, q, show, flats]);
  const count = (st: "active" | "cancelled") => (letters || []).filter((l) => l.status === st).length;

  function printList() {
    const w = window.open("", "_blank"); if (!w) { alert("Please allow pop-ups to print."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Letters register</title><style>body{font:11px Arial,sans-serif;margin:0 12px}h1{font-size:14px;margin:6px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px;text-align:left;vertical-align:top}th{background:#0f1d3d;color:#fff}.x{color:#b42318}</style></head><body>${backBar()}
      <h1>AAKAR CO-OP HOUSING SOCIETY LTD. — LETTERS REGISTER • ${esc(new Date().toLocaleDateString("en-IN"))}</h1>
      <table><tr><th>Letter no.</th><th>Date</th><th>Flat</th><th>Member</th><th>To</th><th>Subject</th><th>Signed by</th><th>Status</th></tr>
      ${shown.map((l) => `<tr><td>${esc(l.ref_no)}</td><td>${esc(dmy(l.letter_date))}</td><td>${esc(flatOf(l.flat_id) ? label(flatOf(l.flat_id)!) : l.flat_id)}</td><td>${esc(l.owner_name || "")}</td><td>${esc(l.addressee)}</td><td>${esc(l.subject)}</td><td>${esc(l.signer_name || "")}</td><td class="${l.status === "cancelled" ? "x" : ""}">${l.status === "cancelled" ? `CANCELLED${l.cancel_reason ? `: ${esc(l.cancel_reason)}` : ""}` : "Issued"}</td></tr>`).join("")}
      </table></body></html>`);
    w.document.close();
  }

  const chosen = flatOf(issueFor);
  const waiting = (requests || []).filter((r) => r.status === "requested" || r.status === "approved");
  const hasApproval = templates !== null;   // LETTER_TEMPLATES.sql run: requests are approved before they are issued
  const prefill = forReq && forReq.flat_id === issueFor && draftBody ? draftBody : undefined;
  return (
    <div className="space-y-3">
      {requests !== null && (
        <div className="bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-4 mono text-[12px]">
          <div className={`font-bold tracking-[0.12em] text-[11px] ${waiting.length ? "text-red-700" : ""}`}>REQUESTS FROM MEMBERS • {waiting.length} WAITING</div>
          {waiting.length === 0 ? <div className="opacity-60 text-[11px] mt-1">No letters waiting to be issued. Members ask from MY FLAT → REQUEST A LETTER.</div> : (
            <div className="mt-2 grid gap-2 lg:grid-cols-2">{waiting.map((r) => { const f = flatOf(r.flat_id); return (
              <div key={r.id} className="border border-amber-300 bg-[#fffbea] p-3">
                <div className="flex justify-between gap-2"><b>{r.letter_type}</b><span className={`shrink-0 border px-2 py-0.5 text-[10px] font-bold ${REQ_STATUS[r.status].cls}`}>{REQ_STATUS[r.status].text}</span></div>
                <div className="mt-0.5"><b className="text-[var(--navy)]">Flat {f ? label(f) : r.flat_id}</b>{f ? ` • ${ownerText(f)}` : ""} <span className="opacity-60">• asked {dmy(r.created_at.slice(0, 10))}</span></div>
                <div className="text-[11px] opacity-80">To: {r.addressee ? r.addressee.split("\n").join(", ") : "whomsoever it may concern"}</div>
                {r.purpose && <div className="text-[12px] mt-1 whitespace-pre-wrap">{r.purpose}</div>}
                {tplOf(r)?.kind === "bank" && <div className="text-[11px] mt-1 text-red-700">Bank letter: issued unsigned; signed by hand by the Chairman / Secretary.</div>}
                {r.status === "approved" && <div className="text-[11px] mt-1 text-sky-800">Approved{r.approved_by ? ` by ${r.approved_by}` : ""}{r.approved_at ? ` on ${dmy(r.approved_at.slice(0, 10))}` : ""}</div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {hasApproval && r.status === "requested"
                    ? (canApprove ? <button onClick={() => approve(r)} className="btn-navy px-4 py-2.5 font-bold">APPROVE</button>
                        : <span className="opacity-70 text-[11px] self-center">Waiting for the Chairman / Secretary to approve.</span>)
                    : <button onClick={() => startIssue(r)} className="btn-navy px-4 py-2.5 font-bold">ISSUE LETTER</button>}
                  {(!hasApproval || canApprove) && <button onClick={() => decline(r)} className="btn-line px-4 py-2.5 text-red-700">NOT ISSUE</button>}
                </div>
              </div>); })}</div>)}
        </div>)}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-4 mono text-[12px] space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label id="letter-issue-box" className="flex-1 min-w-[220px] scroll-mt-28"><span className="text-[11px] font-bold">{forReq ? `ISSUING REQUESTED LETTER: ${forReq.letter_type.toUpperCase()}` : "+ ISSUE A LETTER — CHOOSE THE FLAT"}</span>
            <select className="field mt-1" value={issueFor} onChange={(e) => { setIssueFor(e.target.value); setForReq(null); }}>
              <option value="">Choose flat…</option>
              {flats.map((f) => <option key={f.id} value={f.id}>{label(f)} • {ownerText(f) || "—"}</option>)}
            </select></label>
          {issueFor && <button onClick={() => { setIssueFor(""); setForReq(null); }} className="btn-line px-3 py-2.5">CLOSE</button>}
        </div>
        {chosen && <div className="border border-[var(--gold)]"><LettersPanel key={chosen.id} flat={chosen} flats={flats} isCommittee email={email} onChanged={load} prefill={prefill} onIssued={markIssued} /></div>}
      </div>

      {templates !== null && <LetterFormats list={templates} email={email} onChanged={loadTemplates} />}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-4 mono text-[12px]">
        <div className="font-bold tracking-[0.12em] text-[11px]">LETTERS REGISTER</div>
        <div className="opacity-60 text-[11px]">Every letter issued to every flat. The member sees their own letters in MY FLAT → MY LETTERS.</div>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {(["active", "cancelled", "all"] as const).map((k) => (
            <button key={k} onClick={() => setShow(k)} className={`px-3 py-2 border rounded-[3px] font-bold ${show === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>
              {k === "active" ? "ISSUED" : k.toUpperCase()} <span className="opacity-70">{k === "all" ? (letters || []).length : count(k)}</span></button>))}
          <input className="field !w-auto flex-1 min-w-[180px]" placeholder="Search: number, flat, name, subject" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={printList} className="btn-line px-3 py-2">PRINT LIST</button>
        </div>
      </div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[12px]">{error}</div>}
      {letters === null ? <div className="mono text-[12px] opacity-60 p-4">Loading…</div> : shown.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[12px] opacity-70">{(letters || []).length ? "No letters match." : "No letters issued yet."}</div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {shown.map((l) => { const f = flatOf(l.flat_id); return (
            <div key={l.id} className="border border-[var(--border)] bg-white p-3 mono text-[12px]">
              <div className="flex justify-between gap-2 items-start">
                <div className="min-w-0"><div className="font-bold">{l.ref_no} <span className="font-normal opacity-60">• {dmy(l.letter_date)}</span></div>
                  <div className="mt-0.5"><b className="text-[var(--navy)]">Flat {f ? label(f) : l.flat_id}</b>{l.owner_name ? ` • ${l.owner_name}` : ""}</div></div>
                {l.status === "cancelled" ? <span className="shrink-0 border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-bold">CANCELLED</span>
                  : <span className="shrink-0 border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">ISSUED</span>}
              </div>
              <div className="mt-1.5 text-[12.5px]"><b>{l.subject}</b></div>
              <div className="text-[11px] opacity-70">To: {l.addressee}{l.signer_name ? ` • signed by ${l.signer_name}` : ""}</div>
              {l.unsigned && <div className={`text-[11px] font-bold ${l.handed_over_at ? "text-emerald-700" : "text-red-700"}`}>{l.handed_over_at ? `Signed by hand • handed over ${dmy(l.handed_over_at.slice(0, 10))}` : "UNSIGNED COPY • to be signed by hand and handed over (tick it on the flat's page)"}</div>}
              {l.status === "cancelled" && l.cancel_reason && <div className="text-[11px] text-red-700">Reason: {l.cancel_reason}</div>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => openPrint(`Letter ${l.ref_no}`, [letterHtml(l, pc)])} className="btn-navy px-3 py-2">VIEW / PRINT</button>
                <button onClick={() => openFlat(l.flat_id)} className="btn-line px-3 py-2">OPEN FLAT</button>
              </div>
            </div>); })}
        </div>
      )}
    </div>
  );
}
