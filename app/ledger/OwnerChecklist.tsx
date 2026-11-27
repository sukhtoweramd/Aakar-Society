"use client";
// ADMIN → SOCIETY CHECKLIST (27 Nov 2026): the first things a new society sets up, with a tick for each one the app can see.
// Read only: counts come through the logged-in committee member's own database rules; nothing is written here. Steps in lib/ownerChecklist.ts.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/ledgerClient";
import { setViewHint } from "@/lib/viewHint";
import { SOCIETY } from "@/lib/society";
import { EMPTY_FACTS, checklistProgress, checklistSteps, factsFrom, type ChecklistFacts, type Step } from "@/lib/ownerChecklist";
import type { Ctx } from "./ctx";

export default function OwnerChecklist({ ctx, onOpenSection }: { ctx: Ctx; onOpenSection: (section: string) => void }) {
  const [extra, setExtra] = useState<{ settings: any; signatories: number; notices: number; live: boolean } | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);

  // The card shows at once (no blank gap, no jump): the quick counts fill in first, the backup list (slower: it asks storage) fills in after.
  const [backupDays, setBackupDays] = useState<number | null | undefined | "loading">("loading");
  useEffect(() => {
    let off = false;
    (async () => {
      const [s, g, n, l] = await Promise.all([
        supabase.from("billing_settings").select("account_no, upi_id").eq("id", 1).maybeSingle(),
        supabase.from("signatories").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("notices").select("id", { count: "exact", head: true }),
        supabase.from("society_live").select("id").eq("id", 1).maybeSingle(),
      ]);
      if (!off) setExtra({ settings: s.data || null, signatories: g.count || 0, notices: n.count || 0, live: !!l.data });
    })();
    (async () => {
      // Newest saved backup (same list as ADMIN -> BACKUP). No list (storage off / call fails) = the step stays advice only.
      let days: number | null | undefined;
      try {
        const b = await api("/api/backup");
        if (Array.isArray(b?.backups)) {
          const t = b.backups.filter((x: any) => x.kind === "manual").map((x: any) => new Date(x.created).getTime()).filter((x: number) => x > 0);
          days = t.length ? Math.max(0, Math.floor((Date.now() - Math.max(...t)) / 864e5)) : null;
        }
      } catch { /* leave undefined */ }
      if (!off) setBackupDays(days);
    })();
    return () => { off = true; };
  }, []);

  const facts: ChecklistFacts = useMemo(() => !extra ? EMPTY_FACTS : factsFrom({
    profile: { name: SOCIETY.name, full: SOCIETY.full, address: SOCIETY.address, reg: SOCIETY.reg },
    towers: ctx.towers.length, flats: ctx.flats, settings: extra.settings, signatories: extra.signatories, notices: extra.notices, live: extra.live, lastBackupDays: backupDays === "loading" ? undefined : backupDays,
  }), [extra, backupDays, ctx.towers, ctx.flats]);
  const steps = useMemo(() => checklistSteps(facts), [facts]);
  const p = checklistProgress(steps);

  // Opening a step only goes to the screen; whether it is ticked is decided by the data alone (see lib/ownerChecklist.ts).
  function open_(s: Step) {
    const t = s.target;
    if (t.view) setViewHint(t.tab, t.view);
    if (t.tab !== "ADMIN") { ctx.go(t.tab as any); return; }
    if (t.section) onOpenSection(t.section);
  }

  const loading = !extra;
  const shown = open ?? (loading || !p.complete);       // finished checklist folds away; the owner can still open it

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 sm:p-6 min-w-0">
      <button onClick={() => setOpen(!shown)} className="w-full min-h-[44px] flex flex-wrap items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="serif text-[20px] sm:text-[22px] font-bold block">SOCIETY CHECKLIST</span>
          <span className="mono text-[11px] opacity-60 block mt-1">{loading ? "Checking…" : p.complete ? "Everything the app can see is set up." : p.next ? `Next: ${p.next.title}` : ""}</span>
        </span>
        <span className="mono text-[11px] font-bold border border-[var(--border)] px-3 py-2 rounded-[2px] bg-white">{loading ? "– / –" : `${p.done} / ${p.total}`} {shown ? "▲" : "▼"}</span>
      </button>
      <div className="mt-3 h-2 bg-[var(--bg)] border border-[var(--border)] rounded-[2px] overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: loading ? "0%" : `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} /></div>
      {shown && (
        <ol className="mt-4 space-y-2">
          {steps.map((s0, i) => { const s = loading ? { ...s0, done: false, detail: undefined } : s0.key === "backup" && backupDays === "loading" ? { ...s0, detail: "checking…" } : s0; return (
            <li key={s.key}><button onClick={() => open_(s)} className={`w-full text-left border rounded-[3px] p-3 flex gap-3 min-w-0 min-h-[44px] ${s.done ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)] bg-white hover:bg-[var(--bg-soft)]"}`}>
              <span className={`mono text-[12px] font-bold w-7 h-7 shrink-0 flex items-center justify-center rounded-full border ${s.done ? "bg-emerald-600 text-white border-emerald-600" : "border-[var(--border)]"}`}>{s.done ? "✓" : i + 1}</span>
              <span className="min-w-0">
                <span className="mono text-[12px] font-bold block">{s.title}{s.detail ? <span className="font-normal opacity-60"> · {s.detail}</span> : null}</span>
                <span className="mono text-[11px] opacity-70 leading-relaxed block mt-1">{s.hint}</span>
                <span className="mono text-[10px] opacity-60 block mt-1">Where: {s.where}{s.manual ? " · not tracked" : ""}</span>
              </span>
              <span className="mono text-[11px] font-bold ml-auto self-center shrink-0">OPEN →</span>
            </button></li>
          ); })}
        </ol>
      )}
    </div>
  );
}
