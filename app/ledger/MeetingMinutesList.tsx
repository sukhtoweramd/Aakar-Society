"use client";
// NOTICES → Meeting minutes.
//  * Final AGM / SGM minutes: every member.
//  * Committee meeting minutes: only flats of committee members (flats.is_committee), via my_committee_meetings().
import { useEffect, useState } from "react";
import type { Flat } from "@/lib/society";
import { supabase } from "@/lib/supabaseClient";
import { dmy, openPrint } from "@/lib/billing";
import { KIND_LABEL, loadMeetings, minutesHtml, type Action, type Meeting } from "@/lib/minutes";

/** Open full minutes (with action points). Falls back to the minutes alone if the newer SQL is not run yet. */
export async function readMinutes(m: Meeting, flats: Flat[]) {
  const w = window.open("", "_blank");
  const { data } = await supabase.rpc("my_meeting", { p_meeting: m.id });
  const d = data as { meeting: Meeting; actions: Action[] } | null;
  openPrint(`Minutes ${m.kind} ${dmy(m.meeting_date)}`, [minutesHtml(d?.meeting || m, d?.actions || [], flats)], w);
}

function List({ title, note, list, flats }: { title: string; note: string; list: Meeting[]; flats: Flat[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px]">
      <div className="font-bold tracking-[0.14em]">{title}</div>
      <div className="opacity-60 mt-0.5">{note}</div>
      <div className="mt-3 divide-y divide-[var(--border)]">
        {list.map((m) => (
          <div key={m.id} className="py-2.5 flex flex-wrap gap-3 items-center justify-between">
            <div><b className="text-[12px]">{KIND_LABEL[m.kind]}</b> <span className="opacity-70">• {dmy(m.meeting_date)}{m.venue ? ` • ${m.venue}` : ""}</span>
              {m.status === "draft" && <span className="ml-2 text-red-700 font-bold">DRAFT</span>}</div>
            <div className="flex gap-3">
              <button onClick={() => readMinutes(m, flats)} className="btn-navy px-3 py-1.5">READ MINUTES</button>
              {m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="btn-line px-3 py-1.5">SIGNED COPY</a>}
            </div>
          </div>))}
      </div>
    </div>
  );
}

export default function MeetingMinutesList({ flats }: { flats: Flat[] }) {
  const [general, setGeneral] = useState<Meeting[]>([]);
  const [committee, setCommittee] = useState<Meeting[]>([]);
  useEffect(() => {
    loadMeetings().then((d) => setGeneral((d?.meetings || []).filter((m) => (m.kind === "AGM" || m.kind === "SGM") && m.status === "final")));
    supabase.rpc("my_committee_meetings").then(({ data, error }) => { if (!error) setCommittee((data as Meeting[]) || []); });
  }, []);
  if (!general.length && !committee.length) return null;
  return (
    <div className="space-y-4">
      {general.length > 0 && <List title="MINUTES OF GENERAL MEETINGS" note="AGM and special general meetings, as recorded by the committee." list={general} flats={flats} />}
      {committee.length > 0 && <List title="COMMITTEE MEETING MINUTES" note="Shown only to committee members." list={committee} flats={flats} />}
    </div>
  );
}
