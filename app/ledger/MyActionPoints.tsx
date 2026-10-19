"use client";
// MY FLAT → MY ACTION POINTS: tasks from meeting minutes assigned to this flat's committee member.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dmy, openPrint, today } from "@/lib/billing";
import { KIND_LABEL, minutesHtml } from "@/lib/minutes";
import type { Flat } from "@/lib/society";

type Row = { id: string; meeting_id: string; task: string; due_date: string | null; status: "open" | "done"; done_note: string | null; meeting_kind: "AGM" | "SGM" | "Committee"; meeting_date: string };

export default function MyActionPoints({ flats }: { flats: Flat[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  async function load() { const { data, error } = await supabase.rpc("my_action_points"); if (!error) setRows((data as Row[]) || []); }
  useEffect(() => { load(); }, []);
  const open = rows.filter((r) => r.status === "open");
  if (!open.length) return null;
  async function done(r: Row) {
    const note = prompt(`Mark done: "${r.task}"\n\nShort note for the committee (optional):`, "");
    if (note === null) return;
    const { error } = await supabase.rpc("mark_my_action_done", { p_id: r.id, p_note: note });
    if (error) setError(error.message); else load();
  }
  async function viewMinutes(r: Row) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.rpc("my_meeting", { p_meeting: r.meeting_id });
    if (error || !data) { w?.close(); setError(error?.message || "Could not open the minutes."); return; }
    const d = data as any;
    openPrint(`Minutes ${d.meeting.kind} ${dmy(d.meeting.meeting_date)}`, [minutesHtml(d.meeting, d.actions || [], flats)], w);
  }
  return (
    <div className="mt-4 border-2 border-[var(--gold)] bg-[#fffdf5] p-4 mono text-[11px]">
      <div className="font-bold tracking-[0.12em]">MY ACTION POINTS • {open.length}</div>
      <div className="opacity-60 mt-0.5">Tasks given to you in committee / general meetings. Mark them done here; the committee sees it in MINUTES.</div>
      {error && <div className="mt-2 border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}
      <div className="mt-2 space-y-2">
        {open.map((r) => { const late = !!r.due_date && r.due_date < today(); return (
          <div key={r.id} className={`flex flex-wrap gap-x-3 gap-y-1 items-center border-b border-dashed border-[var(--border)] pb-2 ${late ? "text-red-700" : ""}`}>
            <b className="text-[12.5px] flex-1 min-w-[200px]">{r.task}</b>
            <span>{r.due_date ? `by ${dmy(r.due_date)}${late ? " (overdue)" : ""}` : "no date"}</span>
            <button onClick={() => viewMinutes(r)} className="underline opacity-80" title="Open the minutes of this meeting">{KIND_LABEL[r.meeting_kind]} {dmy(r.meeting_date)} • view minutes</button>
            <button onClick={() => done(r)} className="btn-navy px-2.5 py-1 text-[10px]">✓ DONE</button>
          </div>); })}
      </div>
    </div>
  );
}
