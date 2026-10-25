"use client";
// Complaints (item 19). Made for phones first: one card per complaint, big buttons, no wide tables.
//  • mode "flat"      (MY FLAT): raise a complaint, see my complaints, and — for a committee member's flat — the ones assigned to me
//  • mode "committee" (COMMITTEE → COMPLAINTS): every complaint, filters, status, change area, print
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, ownerText, type Flat, type MemberLite } from "@/lib/society";
import { familySummary } from "@/lib/society";
import { loadAreas, personOf, type Area } from "@/lib/committee";
import { waLink } from "@/lib/billing";
import { backBar } from "@/lib/printBack";
import { daysOpen, loadComplaints, moveArea, raiseComplaint, setStatus, STATUS, waDoneText, waNewText, when, type Complaint } from "@/lib/complaints";
import { FileLink, SecureImg } from "./SecureFile";

type Props = { mode: "flat" | "committee"; flats: Flat[]; flatId: string | null; isCommittee: boolean; onCount?: (n: number) => void };
const flatText = (flats: Flat[], id: string | null) => { const f = flats.find((x) => x.id === id); return f ? label(f) : id || "—"; };
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function ComplaintsPanel({ mode, flats, flatId, isCommittee, onCount }: Props) {
  const [list, setList] = useState<Complaint[] | null | undefined>(undefined);
  const [areas, setAreas] = useState<Area[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const [areaFilter, setAreaFilter] = useState("");
  async function load() {
    const [c, a] = await Promise.all([loadComplaints(), loadAreas(isCommittee)]);
    setList(c); setAreas(a || []);
    if (c) onCount?.(c.filter((x) => x.status !== "closed" && (mode === "committee" || x.assigned_flat === flatId || x.backup_flat === flatId)).length);
  }
  useEffect(() => { load(); }, [flatId]);
  useEffect(() => { if (mode === "committee") supabase.from("members").select("*").then(({ data }) => setMembers((data as MemberLite[]) || [])); }, [mode]);
  const mobileOf = (id: string) => { const f = flats.find((x) => x.id === id); if (!f) return null; const x = familySummary(f, members); return x.head?.mobile || x.mobile || (f as any).owner_mobile || null; };

  if (list === undefined) return mode === "committee" ? <div className="mono text-[12px] opacity-60 p-6">Loading…</div> : null;
  if (list === null) return mode === "committee" ? <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[12px]">Run <b>COMPLAINTS.sql</b> in Supabase to turn on complaints.</div> : null;

  const mine = list.filter((c) => c.flat_id === flatId);
  const assigned = list.filter((c) => c.flat_id !== flatId && (c.assigned_flat === flatId || c.backup_flat === flatId));
  const shown = list.filter((c) => (filter === "all" || (filter === "closed" ? c.status === "closed" : c.status !== "closed")) && (!areaFilter || c.area_id === areaFilter));

  function print() {
    const w = window.open("", "_blank"); if (!w) { alert("Please allow pop-ups to print."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Complaints</title><style>
      body{font:11px Arial,sans-serif;margin:0 12px}h1{font-size:14px;margin:6px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px;vertical-align:top;text-align:left}th{background:#0f1d3d;color:#fff}@page{size:A4;margin:10mm}</style></head><body>
      ${backBar()}<h1>AAKAR CO-OP HOUSING SOCIETY LTD. — COMPLAINTS (${esc(filter === "active" ? "open / in progress" : filter)}) • ${esc(new Date().toLocaleDateString("en-IN"))}</h1>
      <table><tr><th>No.</th><th>Date</th><th>Flat</th><th>Area</th><th>Complaint</th><th>Status</th><th>Days</th><th>Action / note</th></tr>
      ${shown.map((c) => `<tr><td>${esc(c.complaint_no)}</td><td>${esc(when(c.created_at))}</td><td>${esc(flatText(flats, c.flat_id))}</td><td>${esc(c.area_name)}</td><td>${esc(c.description)}</td><td>${STATUS[c.status].text}</td><td>${daysOpen(c)}</td><td>${esc(c.close_note || c.progress_note || "")}</td></tr>`).join("")}
      </table></body></html>`);
    w.document.close();
  }

  const card = (c: Complaint, canAct: boolean) => <ComplaintCard key={c.id} c={c} flats={flats} areas={areas} canAct={canAct} isCommittee={isCommittee}
    mobile={mode === "committee" ? mobileOf(c.flat_id) : null} onChanged={load} onError={setError} />;

  if (mode === "committee") {
    const counts = { active: list.filter((c) => c.status !== "closed").length, closed: list.filter((c) => c.status === "closed").length, all: list.length };
    return (
      <div className="space-y-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-4 flex flex-wrap gap-2 items-center mono text-[12px]">
          {(["active", "closed", "all"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-2 border rounded-[3px] font-bold ${filter === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>
              {k === "active" ? "OPEN" : k.toUpperCase()} <span className="opacity-70">{counts[k]}</span></button>))}
          <select className="field !w-auto !py-2" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={print} className="btn-line px-3 py-2 ml-auto">PRINT</button>
        </div>
        {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[12px]">{error}</div>}
        {shown.length ? <div className="grid gap-3 lg:grid-cols-2">{shown.map((c) => card(c, true))}</div>
          : <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[12px] opacity-70">No complaints here.</div>}
      </div>
    );
  }

  // MY FLAT
  return (
    <div id="sec-complaints" className="scroll-mt-28 border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 mt-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <div className="mono text-[11px] font-bold tracking-[0.16em]">COMPLAINTS</div>
          <div className="mono text-[11px] opacity-60">Goes to the committee member responsible for that area</div>
        </div>
      </div>
      {flatId && <RaiseForm flatId={flatId} flats={flats} areas={areas.filter((a) => a.active !== false)} onDone={load} />}
      {error && <div className="mt-3 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[12px]">{error}</div>}
      {assigned.filter((c) => c.status !== "closed").length > 0 && <>
        <div className="mt-4 mono text-[11px] font-bold tracking-[0.12em] text-red-700">ASSIGNED TO YOU • {assigned.filter((c) => c.status !== "closed").length} OPEN</div>
        <div className="mt-2 grid gap-3">{assigned.filter((c) => c.status !== "closed").map((c) => card(c, true))}</div>
      </>}
      {mine.length > 0 && <>
        <div className="mt-4 mono text-[11px] font-bold tracking-[0.12em]">MY COMPLAINTS</div>
        <div className="mt-2 grid gap-3">{mine.slice(0, 20).map((c) => card(c, isCommittee || (!!flatId && (c.assigned_flat === flatId || c.backup_flat === flatId))))}</div>
      </>}
    </div>
  );
}

function RaiseForm({ flatId, flats, areas, onDone }: { flatId: string; flats: Flat[]; areas: Area[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState(""); const [text, setText] = useState(""); const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [done, setDone] = useState<{ c: Complaint; note: string } | null>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const chosen = areas.find((a) => a.id === area);
  const holder = chosen ? personOf(flats, chosen.holder_flat) : null;

  async function submit() {
    if (!area) { setErr("Choose the problem area."); return; }
    if (text.trim().length < 5) { setErr("Describe the problem in a few words."); return; }
    setBusy(true); setErr("");
    try {
      const r = await raiseComplaint(flatId, area, text, photo);
      setDone({ c: r.complaint, note: r.note }); setArea(""); setText(""); setPhoto(null); setOpen(false); onDone();
    } catch (e: any) { setErr(e.message || "Could not send the complaint."); }
    setBusy(false);
  }

  if (!areas.length) return <div className="mt-3 mono text-[12px] opacity-70">The committee has not set up the areas of responsibility yet.</div>;
  return (
    <div className="mt-3">
      {done && (
        <div className="border border-emerald-300 bg-emerald-50 p-3 mono text-[12px] mb-3">
          <div className="font-bold text-emerald-800">✓ Complaint {done.c.complaint_no} sent to {done.c.area_name}.{done.note}</div>
          {(() => { const a = areas.find((x) => x.id === done.c.area_id); return a?.contact_phone ? (
            <a href={waLink(a.contact_phone, waNewText(done.c, flatText(flats, flatId)))} target="_blank" rel="noopener noreferrer" className="btn-navy inline-block mt-2 px-4 py-2.5">📲 ALSO TELL ON WHATSAPP</a>
          ) : <div className="mt-1 opacity-80">The responsible member will see it in the app.</div>; })()}
          <button onClick={() => setDone(null)} className="underline ml-3 mt-2 inline-block">OK</button>
        </div>)}
      {!open ? <button onClick={() => setOpen(true)} className="btn-gold w-full sm:w-auto px-5 py-3 mono text-[12px] tracking-[0.08em]">+ RAISE A COMPLAINT</button> : (
        <div className="border border-[var(--gold)] bg-[#fffdf5] p-3 space-y-3 mono text-[12px]">
          <label className="block"><span className="text-[11px] font-bold">PROBLEM AREA *</span>
            <select className="field mt-1" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Choose…</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          {chosen && <div className="text-[11px] opacity-75">Goes to <b>{holder ? `${holder.name}${holder.role ? ` (${holder.role})` : ""}` : "the committee"}</b>{chosen.description ? ` • ${chosen.description}` : ""}</div>}
          <label className="block"><span className="text-[11px] font-bold">WHAT IS THE PROBLEM? *</span>
            <textarea className="field mt-1" rows={4} maxLength={1000} placeholder="e.g. Tower B lift stops between 4th and 5th floor since yesterday" value={text} onChange={(e) => setText(e.target.value)} /></label>
          <div>
            <span className="text-[11px] font-bold">PHOTO (optional)</span>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <label className="btn-line px-4 py-2.5 cursor-pointer">{photo ? "CHANGE PHOTO" : "📷 ADD PHOTO"}
                <input type="file" hidden accept="image/*" onChange={(e) => { setPhoto(e.target.files?.[0] || null); e.target.value = ""; }} /></label>
              {preview && <><img src={preview} alt="" className="h-16 w-16 object-cover border border-[var(--border)]" /><button onClick={() => setPhoto(null)} className="text-red-600 underline">remove</button></>}
            </div>
          </div>
          {err && <div className="text-red-700">{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="btn-navy flex-1 sm:flex-none px-5 py-3 font-bold">{busy ? "SENDING…" : "SEND COMPLAINT"}</button>
            <button onClick={() => { setOpen(false); setErr(""); }} className="btn-line px-4 py-3">CANCEL</button>
          </div>
        </div>)}
    </div>
  );
}

function ComplaintCard({ c, flats, areas, canAct, isCommittee, mobile, onChanged, onError }:
  { c: Complaint; flats: Flat[]; areas: Area[]; canAct: boolean; isCommittee: boolean; mobile: string | null; onChanged: () => void; onError: (m: string) => void }) {
  const [act, setAct] = useState<"" | "progress" | "close" | "move">("");
  const [note, setNote] = useState(""); const [area, setArea] = useState(c.area_id || ""); const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const f = flats.find((x) => x.id === c.flat_id);
  const who = personOf(flats, c.assigned_flat);
  async function run(fn: () => Promise<any>) {
    setBusy(true); onError("");
    try { await fn(); setAct(""); setNote(""); onChanged(); } catch (e: any) { onError(`${c.complaint_no}: ${e.message}`); }
    setBusy(false);
  }
  return (
    <div className="border border-[var(--border)] bg-white p-3 mono text-[12px]">
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0">
          <div className="font-bold">{c.complaint_no} <span className="font-normal opacity-60">• {when(c.created_at)}</span></div>
          <div className="mt-0.5"><b className="text-[var(--navy)]">{c.area_name || "General"}</b> • Flat {f ? label(f) : c.flat_id}{isCommittee && f ? <span className="opacity-60"> ({ownerText(f)})</span> : null}</div>
        </div>
        <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-bold ${STATUS[c.status].cls}`}>{STATUS[c.status].text}</span>
      </div>
      <div className="mt-2 text-[13px] whitespace-pre-wrap break-words" style={{ fontFamily: "inherit" }}>{c.description}</div>
      {c.photo_key && <FileLink file={c.photo_key} className="inline-block mt-2"><SecureImg src={c.photo_key} alt="Complaint photo" className="h-24 w-24 object-cover border border-[var(--border)]" /></FileLink>}
      <div className="mt-2 text-[11px] opacity-75">
        With: {who ? `${who.name}${who.role ? ` (${who.role})` : ""}` : "the committee"}{c.status !== "closed" ? ` • ${daysOpen(c)} day${daysOpen(c) === 1 ? "" : "s"} open` : ""}
      </div>
      {c.progress_note && c.status !== "closed" && <div className="mt-1 text-[12px]"><b>Update:</b> {c.progress_note}</div>}
      {c.status === "closed" && <div className="mt-1 text-[12px] text-emerald-800"><b>Done ({when(c.closed_at)}):</b> {c.close_note}</div>}
      <button onClick={() => setShowLog((v) => !v)} className="mt-1 text-[11px] underline opacity-70">{showLog ? "hide history" : "history"}</button>
      {showLog && <ul className="mt-1 text-[11px] opacity-80 space-y-0.5">{(c.history || []).map((h, i) => <li key={i}>{when(h.at)} • {String(h.status).replace("_", " ")} • {h.by}{h.note ? ` — ${h.note}` : ""}</li>)}</ul>}

      {canAct && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          {!act ? (
            <div className="flex flex-wrap gap-2">
              {c.status === "open" && <button onClick={() => setAct("progress")} className="btn-line px-3 py-2.5 font-bold">IN PROGRESS</button>}
              {c.status !== "closed" && <button onClick={() => setAct("close")} className="btn-navy px-3 py-2.5 font-bold">CLOSE ✓</button>}
              {c.status === "closed" && isCommittee && <button onClick={() => run(() => setStatus(c.id, "open", "reopened by committee"))} disabled={busy} className="btn-line px-3 py-2.5">REOPEN</button>}
              {isCommittee && c.status !== "closed" && <button onClick={() => setAct("move")} className="btn-line px-3 py-2.5">CHANGE AREA</button>}
              {mobile && c.status !== "open" && <a href={waLink(mobile, waDoneText(c))} target="_blank" rel="noopener noreferrer" className="btn-line px-3 py-2.5">📲 TELL MEMBER</a>}
            </div>
          ) : act === "move" ? (
            <div className="space-y-2">
              <select className="field" value={area} onChange={(e) => setArea(e.target.value)}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <div className="flex gap-2"><button onClick={() => run(() => moveArea(c.id, area))} disabled={busy || !area || area === c.area_id} className="btn-navy px-4 py-2.5">{busy ? "SAVING…" : "MOVE"}</button><button onClick={() => setAct("")} className="btn-line px-4 py-2.5">CANCEL</button></div>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea className="field" rows={3} maxLength={500} placeholder={act === "close" ? "What was done? (required — the member sees this)" : "Update for the member (optional), e.g. technician coming tomorrow"} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => run(() => setStatus(c.id, act === "close" ? "closed" : "in_progress", note))} disabled={busy || (act === "close" && !note.trim())} className="btn-navy flex-1 sm:flex-none px-4 py-2.5 font-bold">{busy ? "SAVING…" : act === "close" ? "CLOSE COMPLAINT" : "SAVE"}</button>
                <button onClick={() => setAct("")} className="btn-line px-4 py-2.5">CANCEL</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
