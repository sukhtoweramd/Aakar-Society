"use client";
// COMMITTEE → MINUTES: AGM / SGM / committee meeting minutes, action points, signed copy.
// Members see only FINAL minutes of general meetings (AGM / SGM), in NOTICES.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, ownerText, type Flat } from "@/lib/society";
import { dmy, openPrint, today } from "@/lib/billing";
import { uploadFile } from "@/lib/ledgerClient";
import { isOverdue, KIND_LABEL, minutesHtml, type Action, type Meeting } from "@/lib/minutes";

type ARow = { id?: string; task: string; owner_flat: string; due_date: string; status: "open" | "done" };
type Form = { id?: string; kind: Meeting["kind"]; meeting_date: string; venue: string; chaired_by: string; attendees: string; agenda: string; minutes: string; file_url: string; status: Meeting["status"]; actions: ARow[] };
const blank = (): Form => ({ kind: "Committee", meeting_date: today(), venue: "Society office", chaired_by: "", attendees: "", agenda: "", minutes: "", file_url: "", status: "draft", actions: [] });

export default function MinutesPanel({ data, flats, committee, email, onChanged }: { data: { meetings: Meeting[]; actions: Action[] }; flats: Flat[]; committee: Flat[]; email: string; onChanged: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [kindF, setKindF] = useState<"ALL" | Meeting["kind"]>("ALL");
  const open = data.actions.filter((a) => a.status === "open");
  const who = (id: string | null) => { const f = flats.find((x) => x.id === id); return f ? `${ownerText(f)}${f.committee_role ? ` • ${f.committee_role}` : ""}` : "—"; };
  const meetingOf = (id: string) => data.meetings.find((m) => m.id === id);
  const list = data.meetings.filter((m) => kindF === "ALL" || m.kind === kindF);

  function edit(m: Meeting) {
    setFile(null); setError("");
    setForm({ id: m.id, kind: m.kind, meeting_date: m.meeting_date, venue: m.venue || "", chaired_by: m.chaired_by || "", attendees: m.attendees || "", agenda: m.agenda || "", minutes: m.minutes || "", file_url: m.file_url || "", status: m.status,
      actions: data.actions.filter((a) => a.meeting_id === m.id).map((a) => ({ id: a.id, task: a.task, owner_flat: a.owner_flat || "", due_date: a.due_date || "", status: a.status })) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save() {
    if (!form) return;
    if (!form.meeting_date) { setError("Enter the meeting date."); return; }
    if (!form.minutes.trim() && !file && !form.file_url) { setError("Type the minutes or attach the signed minutes."); return; }
    if (form.status === "final" && form.kind !== "Committee" && !confirm("Marked FINAL: all members will see these minutes in NOTICES. Continue?")) return;
    setBusy(true); setError("");
    try {
      const file_url = file ? (await uploadFile(file, "minutes")).url : form.file_url || null;
      const row: any = { kind: form.kind, meeting_date: form.meeting_date, venue: form.venue.trim() || null, chaired_by: form.chaired_by.trim() || null, attendees: form.attendees.trim() || null,
        agenda: form.agenda.trim() || null, minutes: form.minutes.trim() || null, file_url, status: form.status, updated_by: email, updated_at: new Date().toISOString() };
      let id = form.id;
      if (id) { const { error } = await supabase.from("meetings").update(row).eq("id", id); if (error) throw error; }
      else { const { data: d, error } = await supabase.from("meetings").insert([{ ...row, created_by: email }]).select("id").single(); if (error) throw error; id = (d as any).id; }
      // action points: update existing, add new, remove deleted
      const keep = form.actions.filter((a) => a.task.trim());
      const oldIds = data.actions.filter((a) => a.meeting_id === id).map((a) => a.id);
      const gone = oldIds.filter((x) => !keep.some((a) => a.id === x));
      if (gone.length) { const { error } = await supabase.from("meeting_actions").delete().in("id", gone); if (error) throw error; }
      for (const a of keep) {
        const r = { meeting_id: id, task: a.task.trim(), owner_flat: a.owner_flat || null, due_date: a.due_date || null };
        const { error } = a.id ? await supabase.from("meeting_actions").update(r).eq("id", a.id) : await supabase.from("meeting_actions").insert([r]);
        if (error) throw error;
      }
      setForm(null); setFile(null); onChanged();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  async function remove(m: Meeting) {
    if (!confirm(`Delete the minutes of the ${KIND_LABEL[m.kind]} on ${dmy(m.meeting_date)} and its action points?`)) return;
    const { error } = await supabase.from("meetings").delete().eq("id", m.id);
    if (error) setError(error.message); else onChanged();
  }
  async function markDone(a: Action) {
    const note = prompt(`Mark done: "${a.task}"\n\nShort note (optional):`, "");
    if (note === null) return;
    const { error } = await supabase.from("meeting_actions").update({ status: "done", done_note: note.trim() || null, done_at: new Date().toISOString(), done_by: email }).eq("id", a.id);
    if (error) setError(error.message); else onChanged();
  }
  const print = (m: Meeting) => openPrint(`Minutes ${m.kind} ${dmy(m.meeting_date)}`, [minutesHtml(m, data.actions, flats)]);
  const setA = (i: number, k: keyof ARow, v: string) => setForm((f) => f && ({ ...f, actions: f.actions.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const T = (k: "attendees" | "agenda" | "minutes", l: string, rows: number, ph: string) => (
    <label className="text-[10px] opacity-80 block">{l}<textarea className="field mt-1 !h-auto font-sans text-[13px] leading-relaxed" rows={rows} placeholder={ph} value={(form as Form)[k]} onChange={(e) => setForm({ ...(form as Form), [k]: e.target.value })} /></label>
  );

  return (
    <div className="space-y-4 mono text-[11px]">
      {open.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4">
          <div className="font-bold tracking-[0.12em] text-[10px]">OPEN ACTION POINTS • {open.length}{open.some(isOverdue) ? <span className="text-red-700"> • {open.filter(isOverdue).length} overdue</span> : ""}</div>
          <div className="mt-2 space-y-1.5">
            {open.map((a) => { const m = meetingOf(a.meeting_id); return (
              <div key={a.id} className={`flex flex-wrap gap-2 items-center border-b border-dashed border-[var(--border)] pb-1.5 ${isOverdue(a) ? "text-red-700" : ""}`}>
                <b className="text-[12px] flex-1 min-w-[220px]">{a.task}</b>
                <span>{who(a.owner_flat)}</span>
                <span>{a.due_date ? `by ${dmy(a.due_date)}${isOverdue(a) ? " (overdue)" : ""}` : "no date"}</span>
                <span className="opacity-60">{m ? `${m.kind} ${dmy(m.meeting_date)}` : ""}</span>
                <button onClick={() => markDone(a)} className="btn-navy px-2.5 py-1 text-[10px]">✓ DONE</button>
              </div>); })}
          </div>
        </div>
      )}

      {form && (
        <div className="border-2 border-[var(--gold)] bg-[#fffdf5] p-4 space-y-3">
          <div className="font-bold tracking-[0.1em] text-[#8a6d14]">{form.id ? "EDIT MINUTES" : "NEW MINUTES"}</div>
          {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
          <div className="grid md:grid-cols-4 gap-3">
            <label className="text-[10px] opacity-80">MEETING<select className="field mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as any })}>
              <option value="Committee">Committee meeting</option><option value="AGM">Annual General Meeting (AGM)</option><option value="SGM">Special General Meeting (SGM)</option></select></label>
            <label className="text-[10px] opacity-80">DATE *<input type="date" className="field mt-1" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">VENUE<input className="field mt-1" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">CHAIRED BY<input className="field mt-1" placeholder="e.g. Chairman – name" value={form.chaired_by} onChange={(e) => setForm({ ...form, chaired_by: e.target.value })} /></label>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {T("attendees", "PRESENT (one per line, or e.g. \"46 members present\")", 4, "Chairman – …\nSecretary – …\nTreasurer – …")}
            {T("agenda", "AGENDA (one item per line)", 4, "Confirm minutes of last meeting\nAccounts for 2025-26\nLift AMC renewal")}
          </div>
          {T("minutes", "PROCEEDINGS AND DECISIONS (leave an empty line between points)", 8, "1. Minutes of the last meeting were read and confirmed.\n\n2. Accounts for 2025-26 were approved unanimously.\n\n3. Resolved to renew the lift AMC with … for ₹… from 1 April 2027.")}
          <div>
            <div className="text-[10px] opacity-80">ACTION POINTS</div>
            {form.actions.map((a, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center mt-1.5">
                <input className="field !w-auto flex-1 min-w-[240px]" placeholder="What is to be done" value={a.task} onChange={(e) => setA(i, "task", e.target.value)} />
                <select className="field !w-[240px]" value={a.owner_flat} onChange={(e) => setA(i, "owner_flat", e.target.value)}><option value="">— responsible —</option>
                  {committee.map((f) => <option key={f.id} value={f.id}>{ownerText(f)}{f.committee_role ? ` – ${f.committee_role}` : ""} ({label(f)})</option>)}</select>
                <input type="date" className="field !w-[150px]" value={a.due_date} onChange={(e) => setA(i, "due_date", e.target.value)} title="By when" />
                {a.status === "done" && <span className="tag bg-emerald-50 text-emerald-700">DONE</span>}
                <button onClick={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })} className="text-red-600 underline">remove</button>
              </div>))}
            <button onClick={() => setForm({ ...form, actions: [...form.actions, { task: "", owner_flat: "", due_date: "", status: "open" }] })} className="underline mt-2">+ add action point</button>
          </div>
          <div className="grid md:grid-cols-2 gap-3 items-end">
            <label className="text-[10px] opacity-80">SIGNED MINUTES (PDF / PHOTO){form.file_url && !file && <span className="ml-1 text-emerald-700">• attached</span>}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="field mt-1 !py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
            <div className="text-[10px] opacity-80">STATUS
              <div className="flex gap-4 mt-1.5 text-[12px]">
                <label className="flex items-center gap-1.5"><input type="radio" checked={form.status === "draft"} onChange={() => setForm({ ...form, status: "draft" })} /> Draft (committee only)</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={form.status === "final"} onChange={() => setForm({ ...form, status: "final" })} /> Final{form.kind !== "Committee" ? " (members see it)" : ""}</label>
              </div></div>
          </div>
          <div className="flex gap-2"><button onClick={save} disabled={busy} className="btn-navy px-4 py-2.5 font-bold">{busy ? "SAVING…" : "SAVE MINUTES"}</button><button onClick={() => setForm(null)} className="btn-line px-4 py-2.5">CANCEL</button></div>
        </div>
      )}
      {!form && error && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px]">
        <div className="flex flex-wrap justify-between items-center gap-3 p-5">
          <div><div className="serif text-[18px] font-bold">Minutes of meetings</div>
            <div className="opacity-60 mt-0.5">AGM and SGM minutes marked FINAL are shown to all members in NOTICES. Committee meeting minutes stay with the committee.</div></div>
          <div className="flex gap-2 items-center">
            <select className="field !w-auto" value={kindF} onChange={(e) => setKindF(e.target.value as any)}><option value="ALL">All meetings</option><option value="AGM">AGM</option><option value="SGM">SGM</option><option value="Committee">Committee</option></select>
            {!form && <button onClick={() => { setForm(blank()); setFile(null); setError(""); }} className="btn-navy px-4 py-2 font-bold">+ NEW MINUTES</button>}
          </div>
        </div>
        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-[12px] min-w-[860px]">
            <thead><tr className="bg-[var(--navy)] text-white text-left text-[10px] tracking-[0.08em]">
              <th className="px-3 py-2">DATE</th><th className="px-3 py-2">MEETING</th><th className="px-3 py-2">AGENDA</th><th className="px-3 py-2">ACTIONS</th><th className="px-3 py-2">STATUS</th><th className="px-3 py-2"></th></tr></thead>
            <tbody>
              {list.map((m) => { const acts = data.actions.filter((a) => a.meeting_id === m.id); const ag = (m.agenda || "").split("\n").filter((x) => x.trim()); return (
                <tr key={m.id} className="border-b border-[var(--border)] align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap font-bold">{dmy(m.meeting_date)}</td>
                  <td className="px-3 py-2.5">{KIND_LABEL[m.kind]}<div className="opacity-60 text-[11px]">{[m.venue, m.chaired_by].filter(Boolean).join(" • ")}</div></td>
                  <td className="px-3 py-2.5 max-w-[340px]">{ag.slice(0, 3).join(" • ")}{ag.length > 3 ? ` • +${ag.length - 3} more` : ""}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{acts.length ? `${acts.filter((a) => a.status === "open").length} open / ${acts.length}` : <span className="opacity-40">—</span>}</td>
                  <td className="px-3 py-2.5">{m.status === "final" ? <span className="tag bg-emerald-50 text-emerald-700">FINAL{m.kind !== "Committee" ? " • MEMBERS SEE" : ""}</span> : <span className="tag bg-amber-50 text-amber-700">DRAFT</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <button onClick={() => print(m)} className="underline font-bold text-[var(--navy)] mr-3">print</button>
                    {m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="underline mr-3">signed copy</a>}
                    <button onClick={() => edit(m)} className="underline mr-3">edit</button>
                    <button onClick={() => remove(m)} className="underline text-red-600">delete</button></td>
                </tr>); })}
              {list.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center opacity-60">No minutes yet. Add the last AGM and committee meetings with + NEW MINUTES.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
