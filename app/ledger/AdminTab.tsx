"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_RATES, rupees } from "@/lib/society";
import { api } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";
import LoginsPanel from "./LoginsPanel";
import CommitteePanel from "./CommitteePanel";
import BackupPanel from "./BackupPanel";
import TestDataPanel from "./TestDataPanel";

type Row = { maint: string; sqft: string; bhk: string };

export default function AdminTab({ ctx }: { ctx: Ctx }) {
  const { categories, flats, reloadFlats } = ctx;
  const hasSqft = flats.length > 0 && "sqft" in flats[0];
  const fromData = () => Object.fromEntries(categories.map((c) => [c.key, { maint: c.maint?.toString() ?? "", sqft: c.sqft?.toString() ?? "", bhk: c.bhk }])) as Record<string, Row>;
  const [rows, setRows] = useState<Record<string, Row>>(fromData);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setRows(fromData()); }, [categories.map((c) => `${c.key}${c.maint}${c.sqft}${c.bhk}`).join()]);

  const set = (key: string, field: keyof Row, v: string) => setRows((r) => ({ ...r, [key]: { ...r[key], [field]: v } }));
  const changed = categories.filter((c) => {
    const r = rows[c.key];
    return r && (r.maint !== (c.maint?.toString() ?? "") || r.bhk !== c.bhk || (hasSqft && r.sqft !== (c.sqft?.toString() ?? "")));
  });

  async function apply() {
    if (!changed.length) return;
    const summary = changed.map((c) => `${c.label}: ${c.ids.length} flats`).join("\n");
    if (!confirm(`Update these flats in the database?\n\n${summary}`)) return;
    setBusy("apply"); setMsg(null);
    try {
      for (const c of changed) {
        const r = rows[c.key];
        const upd: any = { maintenance: r.maint === "" ? null : Number(r.maint), bhk: r.bhk.trim() || null };
        if (hasSqft) upd.sqft = r.sqft === "" ? null : Number(r.sqft);
        const { error } = await supabase.from("flats").update(upd).in("id", c.ids);
        if (error) throw new Error(`${c.label}: ${error.message}`);
      }
      await reloadFlats();
      setMsg({ ok: true, text: `Saved. ${changed.reduce((n, c) => n + c.ids.length, 0)} flats updated.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy(null);
  }

  function resetDefaults() {
    setRows((r) => {
      const next = { ...r };
      for (const c of categories) {
        const d = DEFAULT_RATES[c.key];
        if (d) next[c.key] = { maint: String(d.maint), sqft: String(d.sqft), bhk: d.bhk };
      }
      return next;
    });
    setMsg({ ok: true, text: "Default society rates filled in. Review, then click APPLY TO FLATS to save." });
  }

  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm(`Add/update flats from "${file.name}"? Flats with the same ID are updated; nothing is deleted.`)) return;
    setBusy("excel"); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const j = await api("/api/upload", { method: "POST", body: fd });
      await reloadFlats();
      setMsg({ ok: true, text: `Excel import: ${j.count} flats saved.` });
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
    setBusy(null);
  }

  const monthly = flats.reduce((n, f) => n + (f.maintenance || 0), 0);
  const terraceCount = categories.filter((c) => c.terrace).reduce((n, c) => n + c.ids.length, 0);
  const preview = categories.reduce((n, c) => n + (Number(rows[c.key]?.maint) || 0) * c.ids.length, 0);

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="serif text-[22px] font-bold">SOCIETY CHARGES CONTROL PANEL</div>
            <div className="mono text-[11px] opacity-60 mt-1">Terrace Logic: top floor owns terrace = higher fee & larger sqft • {categories.length} categories • Changes apply to every flat in the category</div>
          </div>
          <div className="mono text-[10px] border border-[var(--border)] px-3 py-2 bg-[var(--bg)] self-start">
            {changed.length ? <span className="text-amber-700">● {changed.length} UNSAVED CHANGE{changed.length > 1 ? "S" : ""}</span> : <span className="text-emerald-600">● SAVED • Matches ledger</span>}
          </div>
        </div>
        {msg && <div className={`mt-4 p-3 mono text-[11px] border ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
        <div className="mt-6 grid gap-3">
          {categories.map((c) => {
            const r = rows[c.key] || { maint: "", sqft: "", bhk: "" };
            return (
              <div key={c.key} className={`grid lg:grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-3 items-center border rounded-[3px] p-3 ${c.terrace ? "bg-[#fff8d6] border-amber-300" : "bg-[var(--bg)] border-[var(--border)]"}`}>
                <div>
                  <div className="mono text-[11px] font-bold tracking-[0.08em]">{c.label}</div>
                  <div className="mono text-[10px] opacity-60 mt-1">{c.ids.length} FLATS • {c.range}</div>
                </div>
                <label className="block"><div className="mono text-[9px] opacity-60">MAINT ₹</div>
                  <input type="number" value={r.maint} onChange={(e) => set(c.key, "maint", e.target.value)} className="w-full mono text-[13px] border border-[var(--border)] bg-white px-2 py-1.5 rounded-[2px]" /></label>
                <label className="block"><div className="mono text-[9px] opacity-60">SQFT</div>
                  <input type="number" value={r.sqft} disabled={!hasSqft} title={hasSqft ? "" : "Run the sqft SQL step to enable"} onChange={(e) => set(c.key, "sqft", e.target.value)} className="w-full mono text-[13px] border border-[var(--border)] bg-white px-2 py-1.5 rounded-[2px] disabled:opacity-50" /></label>
                <label className="block"><div className="mono text-[9px] opacity-60">BHK</div>
                  <input value={r.bhk} onChange={(e) => set(c.key, "bhk", e.target.value)} className="w-full mono text-[12px] border border-[var(--border)] bg-white px-2 py-1.5 rounded-[2px]" /></label>
                <div className="mono text-[10px] text-center">
                  {c.terrace ? <span className="bg-amber-400 text-black px-2 py-1">TERRACE</span> : <span className="border border-[var(--border)] px-2 py-1 bg-white">STANDARD</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={apply} disabled={!changed.length || !!busy} className="btn-navy mono text-[12px] tracking-[0.1em] px-6 py-2.5">{busy === "apply" ? "SAVING…" : "APPLY TO FLATS"}</button>
          <button onClick={() => { setRows(fromData()); setMsg(null); }} disabled={!changed.length} className="btn-line mono text-[11px] px-4 py-2.5">DISCARD CHANGES</button>
        </div>
        {!hasSqft && <div className="mt-2 mono text-[10px] opacity-60">SQFT is read-only until the one-line database step for sqft is run.</div>}

        <div className="mt-6 border-t border-[var(--border)] pt-5 grid md:grid-cols-[1.2fr_0.8fr] gap-4 mono text-[11px] items-start">
          <div className="border border-[var(--border)] p-4 bg-[var(--bg)] rounded-[3px]">
            <div className="font-bold tracking-[0.06em]">CALCULATED TOTALS</div>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between"><span className="opacity-70">Monthly Maintenance (ledger)</span><span className="font-bold serif text-[14px]">{rupees(monthly)}</span></div>
              <div className="flex justify-between"><span className="opacity-70">Annual Collection</span><span className="font-bold">{rupees(monthly * 12)}</span></div>
              {changed.length > 0 && <div className="flex justify-between text-amber-700"><span>Monthly after unsaved changes</span><span className="font-bold">{rupees(preview)}</span></div>}
              <div className="flex justify-between"><span className="opacity-70">Terrace Premium Flats</span><span>{terraceCount} flats</span></div>
              <div className="flex justify-between opacity-60"><span>Standard Flats</span><span>{flats.length - terraceCount} flats</span></div>
            </div>
          </div>
          <div className="border border-amber-200 bg-[#fffbeb] p-4 rounded-[4px]">
            <div className="mono text-[10px] font-bold tracking-[0.08em]">RESET CHARGES</div>
            <div className="mono text-[11px] leading-relaxed mt-2 opacity-80">Fill in the original society-approved rates. Nothing is saved until you click APPLY TO FLATS.</div>
            <div className="mono text-[10px] mt-2 opacity-60 leading-relaxed">A 3500/1650, A terrace 5000/1850, B 2500/1100, B terrace 4000/1300, C 2000/950, C terrace 3200/1150</div>
            <button onClick={resetDefaults} className="mt-4 mono text-[11px] font-bold tracking-[0.08em] border border-[var(--navy)] bg-[var(--surface)] hover:bg-[var(--bg-soft)] px-4 py-2.5 rounded-[3px] w-full text-left flex justify-between items-center"><span>FILL DEFAULT RATES</span><span>↺</span></button>
          </div>
        </div>
      </div>

      <CommitteePanel flats={ctx.flats} />

      <LoginsPanel ctx={ctx} />

      <BackupPanel />

      <TestDataPanel />

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6 flex flex-wrap justify-between gap-4 items-center">
        <div>
          <div className="mono text-[11px] font-bold tracking-[0.12em]">IMPORT FROM EXCEL</div>
          <div className="mono text-[10px] opacity-60 mt-1 max-w-[560px]">Columns: Tower, Floor, Flat No, Owner Name, BHK, Maintenance, Email, Committee, Status. Flats are matched by number (A1001); blank cells keep existing values; nothing is deleted.</div>
        </div>
        <label className="btn-navy mono text-[12px] tracking-[0.08em] px-5 py-2.5 cursor-pointer">
          {busy === "excel" ? "IMPORTING…" : "📤 UPLOAD EXCEL"}
          <input type="file" hidden accept=".xlsx,.xls" disabled={!!busy} onChange={handleExcel} />
        </label>
      </div>
    </div>
  );
}
