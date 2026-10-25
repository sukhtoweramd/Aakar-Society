"use client";
// REPORTS → NOMINATIONS: which flats have named a nominee, whether shares add up to 100%, and whether the signed form
// has reached the society. Phone first: one line per flat.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, ownerText, sortFlats, type Flat } from "@/lib/society";
import { shareTotal, type NominationStatus } from "@/lib/nominees";

type Row = { flat_id: string; share_pct: number };
export default function NominationReport({ list, onOpen }: { list: Flat[]; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<NominationStatus[]>([]);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState<"todo" | "all">("todo");
  useEffect(() => {
    Promise.all([supabase.from("nominees").select("flat_id, share_pct"), supabase.from("nomination_status").select("*")]).then(([n, s]) => {
      setFailed(!!n.error); setRows((n.data as Row[]) || []); setStatus((s.data as NominationStatus[]) || []);
    });
  }, []);
  const table = useMemo(() => [...list].sort(sortFlats).map((f) => {
    const mine = (rows || []).filter((r) => r.flat_id === f.id);
    const st = status.find((s) => s.flat_id === f.id);
    const total = shareTotal(mine);
    const state = !mine.length ? "none" : total !== 100 ? "shares" : !st?.form_received ? "form" : "done";
    return { f, count: mine.length, total, state };
  }), [list, rows, status]);
  const counts = { none: table.filter((t) => t.state === "none").length, form: table.filter((t) => t.state === "form" || t.state === "shares").length, done: table.filter((t) => t.state === "done").length };
  const shown = show === "todo" ? table.filter((t) => t.state !== "done") : table;
  const TEXT: Record<string, [string, string]> = { none: ["No nominee", "text-red-700"], shares: ["Shares ≠ 100%", "text-red-700"], form: ["Signed form pending", "text-amber-700"], done: ["Done ✓", "text-emerald-700"] };

  return (
    <div className="border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
      <div className="mono text-[11px] font-bold tracking-[0.12em]">NOMINATIONS</div>
      <div className="mono text-[11px] opacity-70 mt-1">{rows === null ? "Loading…" : failed ? "Run NOMINEES.sql in Supabase first." : `${counts.done} done • ${counts.form} waiting for the signed form or shares • ${counts.none} with no nominee`}</div>
      <div className="mt-3 flex gap-2 mono text-[11px]">
        {(["todo", "all"] as const).map((k) => <button key={k} onClick={() => setShow(k)} className={`px-3 py-2 border rounded-[3px] font-bold ${show === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>{k === "todo" ? "STILL TO DO" : "ALL FLATS"}</button>)}
      </div>
      <div className="mt-3 max-h-[420px] overflow-auto divide-y divide-[var(--border)] border border-[var(--border)] bg-white">
        {shown.map((t) => (
          <button key={t.f.id} onClick={() => onOpen(t.f.id)} className="w-full text-left px-3 py-2.5 flex justify-between gap-2 mono text-[12px] hover:bg-[var(--bg-soft)]">
            <span className="min-w-0 truncate"><b>{label(t.f)}</b> <span className="opacity-60">{ownerText(t.f)}</span></span>
            <span className={`shrink-0 font-bold ${TEXT[t.state][1]}`}>{TEXT[t.state][0]}{t.count ? ` • ${t.count}` : ""}</span>
          </button>))}
        {!shown.length && rows !== null && <div className="p-3 mono text-[12px] opacity-70">Every flat is done.</div>}
      </div>
      <div className="mono text-[10.5px] opacity-60 mt-2">Tap a flat to open it and enter or check the nominee (MY FLAT page → NOMINEE).</div>
    </div>
  );
}
