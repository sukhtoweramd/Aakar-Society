"use client";
// ADMIN → FLAT SETUP → FLOORS & FLATS, only while the society has NO flats: enter floors, flats per floor and the maintenance for each
// tower, check the preview, then create all the flats in one go (main admin only; the server checks it again and refuses if any flat exists).
import { useMemo, useState } from "react";
import { api } from "@/lib/ledgerClient";
import { rupees } from "@/lib/society";
import { buildFlatPlan, planError, planSummary, planWarnings, type TowerPlan } from "@/lib/flatPlan";
import type { Ctx } from "./ctx";
import { useIsMainAdmin } from "./SetupEditors";

type Row = { floors: string; perFloor: string; maint: string; maintTerrace: string };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const Field = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block min-w-0"><div className="mono text-[10px] tracking-[0.1em] opacity-60 mb-1">{t}</div>{children}</label>;

export default function FlatGenerator({ ctx }: { ctx: Ctx }) {
  const isMain = useIsMainAdmin();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const get = (code: string): Row => rows[code] || { floors: "", perFloor: "", maint: "", maintTerrace: "" };
  const set = (code: string, patch: Partial<Row>) => { setMsg(null); setRows((r) => ({ ...r, [code]: { ...get(code), ...patch } })); };

  // a tower is part of the plan once its floors are filled in
  const plan: TowerPlan[] = useMemo(() => ctx.towers.filter((t) => get(t.code).floors.trim() !== "").map((t) => {
    const r = get(t.code);
    return { code: t.code, floors: num(r.floors), perFloor: num(r.perFloor), terrace: t.terrace, maint: r.maint.trim() === "" ? 0 : num(r.maint), maintTerrace: r.maintTerrace.trim() === "" ? 0 : num(r.maintTerrace) };
  }), [ctx.towers, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = plan.length ? planError(plan) : "";
  const flatsList = useMemo(() => (plan.length && !error ? buildFlatPlan(plan) : []), [plan, error]);
  const warnings = useMemo(() => (error ? [] : planWarnings(plan)), [plan, error]);

  async function create() {
    if (!flatsList.length) return;
    if (!confirm(`Create ${flatsList.length} flats now? This is allowed only once, while the society has no flats. Floors, flat numbers and tower codes cannot be changed afterwards.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/flat-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ towers: plan }) });
      await ctx.reloadFlats();
      setMsg({ ok: true, text: `${r.created} flats created.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || "Not created." }); }
    setBusy(false);
  }

  return (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 sm:p-4 grid gap-4 min-w-0">
      <div>
        <div className="serif text-[17px] font-bold">CREATE THE FLATS</div>
        <div className="mono text-[11px] opacity-70 mt-1 leading-relaxed">This society has no flats yet. For each tower enter the number of floors, the flats on each floor and the yearly maintenance. Flats are numbered tower letter + floor + position: A101, A102 … A1001. Leave a tower empty to skip it.</div>
      </div>
      {ctx.towers.map((t) => {
        const r = get(t.code);
        return (
          <div key={t.code} className="border border-[var(--border)] bg-white rounded-[3px] p-3 grid gap-2.5 min-w-0">
            <div className="serif text-[16px] font-bold">{t.name} <span className="mono text-[11px] font-normal opacity-60">code {t.code}{t.terrace ? " • top floor terrace" : ""}</span></div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field t="FLOORS"><input className="field" inputMode="numeric" value={r.floors} onChange={(e) => set(t.code, { floors: e.target.value })} /></Field>
              <Field t="FLATS PER FLOOR"><input className="field" inputMode="numeric" value={r.perFloor} onChange={(e) => set(t.code, { perFloor: e.target.value })} /></Field>
              <Field t="MAINTENANCE / YEAR (₹)"><input className="field" inputMode="numeric" value={r.maint} onChange={(e) => set(t.code, { maint: e.target.value })} /></Field>
              {t.terrace && <Field t="TERRACE FLOOR / YEAR (₹)"><input className="field" inputMode="numeric" value={r.maintTerrace} onChange={(e) => set(t.code, { maintTerrace: e.target.value })} /></Field>}
            </div>
          </div>
        );
      })}

      {plan.length > 0 && (
        <div className="border border-[var(--border)] bg-white rounded-[3px] p-3 min-w-0">
          <div className="mono text-[10px] tracking-[0.1em] font-bold opacity-70 mb-2">PREVIEW</div>
          {error ? <div className="border border-red-200 bg-red-50 text-red-700 p-2.5 mono text-[11px]">{error}</div> : (
            <div className="mono text-[11px] leading-relaxed grid gap-1.5">
              {planSummary(plan).map((s) => <div key={s.code}>Tower {s.code}: {s.flats} flats • {s.first} to {s.last}{s.terraceFlats ? ` • ${s.terraceFlats} on the terrace floor` : ""}</div>)}
              <div className="font-bold mt-1">Total {flatsList.length} flats • maintenance {rupees(Math.min(...flatsList.map((f) => f.maintenance)))}{new Set(flatsList.map((f) => f.maintenance)).size > 1 ? ` to ${rupees(Math.max(...flatsList.map((f) => f.maintenance)))}` : ""} / year</div>
              {warnings.map((w) => <div key={w} className="border border-amber-200 bg-[#fffbeb] p-2.5">{w}</div>)}
            </div>
          )}
        </div>
      )}

      {isMain === false && <div className="mono text-[10px] opacity-70">Only the main admin login can create the flats.</div>}
      {isMain === true && (
        <div><button onClick={create} disabled={busy || !flatsList.length || warnings.length > 0} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy ? "CREATING…" : `CREATE ${flatsList.length || ""} FLATS`.replace("  ", " ")}</button></div>
      )}
      {msg && <div className={`p-3 mono text-[11px] border ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </div>
  );
}
