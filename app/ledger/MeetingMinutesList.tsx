"use client";
// NOTICES → Meeting minutes: final minutes of general meetings (AGM / SGM), for every member.
import { useEffect, useState } from "react";
import type { Flat } from "@/lib/society";
import { dmy, openPrint } from "@/lib/billing";
import { KIND_LABEL, loadMeetings, minutesHtml, type Meeting } from "@/lib/minutes";

export default function MeetingMinutesList({ flats }: { flats: Flat[] }) {
  const [list, setList] = useState<Meeting[]>([]);
  useEffect(() => { loadMeetings().then((d) => setList((d?.meetings || []).filter((m) => m.kind !== "Committee" && m.status === "final"))); }, []);
  if (!list.length) return null;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px]">
      <div className="font-bold tracking-[0.14em]">MINUTES OF GENERAL MEETINGS</div>
      <div className="opacity-60 mt-0.5">AGM and special general meetings, as recorded by the committee.</div>
      <div className="mt-3 divide-y divide-[var(--border)]">
        {list.map((m) => (
          <div key={m.id} className="py-2.5 flex flex-wrap gap-3 items-center justify-between">
            <div><b className="text-[12px]">{KIND_LABEL[m.kind]}</b> <span className="opacity-70">• {dmy(m.meeting_date)}{m.venue ? ` • ${m.venue}` : ""}</span></div>
            <div className="flex gap-3">
              <button onClick={() => openPrint(`Minutes ${m.kind} ${dmy(m.meeting_date)}`, [minutesHtml(m, [], flats)])} className="btn-navy px-3 py-1.5">READ MINUTES</button>
              {m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="btn-line px-3 py-1.5">SIGNED COPY</a>}
            </div>
          </div>))}
      </div>
    </div>
  );
}
