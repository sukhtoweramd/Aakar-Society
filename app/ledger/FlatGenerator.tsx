"use client";
// ADMIN → FLAT SETUP → FLOORS & FLATS: create flats for every tower that has NO flats yet (a new society's towers, or a tower added later).
// Two ways per tower: "same on every floor" (floors + flats per floor) or "type each floor" (flat numbers typed floor by floor).
// Check the preview, then create. Main admin only; the server checks it again, refuses a tower that already has flats or a number that exists.
import { useMemo, useState } from "react";
import { api } from "@/lib/ledgerClient";
import { rupees } from "@/lib/society";
import { buildFlatPlan, parseNumbers, planClashes, planError, planSummary, planWarnings, type TowerPlan } from "@/lib/flatPlan";
import type { Ctx } from "./ctx";
import { useIsMainAdmin } from "./SetupEditors";

type Typed = { floor: string; text: string };
type Row = { mode: "same" | "typed"; floors: string; perFloor: string; maint: string; maintTerrace: string; typed: Typed[] };
const EMPTY: Row = { mode: "same", floors: "", perFloor: "", maint: "", maintTerrace: "", typed: [{ floor: "1", text: "" }] };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const Field = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block min-w-0"><div className="mono text-[10px] tracking-[0.1em] opacity-60 mb-1">{t}</div>{children}</label>;

export default function FlatGenerator({ ctx }: { ctx: Ctx }) {
  const isMain = useIsMainAdmin();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const get = (code: string): Row => rows[code] || EMPTY;
  const set = (code: string, patch: Partial<Row>) => { setMsg(null); setRows((r) => ({ ...r, [code]: { ...(r[code] || EMPTY), ...patch } })); };
  const setTyped = (code: string, i: number, patch: Partial<Typed>) => set(code, { typed: get(code).typed.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  const have = useMemo(() => new Set(ctx.flats.map((f) => String(f.tower ?? "").trim())), [ctx.flats]);
  const free = useMemo(() => ctx.towers.filter((t) => !have.has(t.code)), [ctx.towers, have]);   // towers with no flats

  const plan: TowerPlan[] = useMemo(() => free.flatMap((t) => {
    const r = get(t.code);
    const base = { code: t.code, terrace: t.terrace, maint: r.maint.trim() === "" ? 0 : num(r.maint), maintTerrace: r.maintTerrace.trim() === "" ? 0 : num(r.maintTerrace) };
    if (r.mode === "typed") {
      const layout = r.typed.filter((x) => x.text.trim() !== "").map((x) => ({ floor: num(x.floor), numbers: parseNumbers(x.text) }));
      return layout.length ? [{ ...base, floors: 0, perFloor: 0, layout }] : [];
    }
    return r.floors.trim() === "" ? [] : [{ ...base, floors: num(r.floors), perFloor: num(r.perFloor) }];
  }), [free, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = plan.length ? planError(plan) : "";
  const flatsList = useMemo(() => (plan.length && !error ? buildFlatPlan(plan) : []), [plan, error]);
  const clash = useMemo(() => planClashes(flatsList, ctx.flats.map((f) => f.id)), [flatsList, ctx.flats]);
  const warnings = useMemo(() => (error ? [] : planWarnings(plan)), [plan, error]);
  const blocked = !!error || clash.length > 0 || warnings.length > 0 || !flatsList.length;

  async function create() {
    if (blocked) return;
    if (!confirm(`Create ${flatsList.length} flats in tower ${plan.map((p) => p.code).join(", ")} now? Their floors, numbers and tower cannot be changed afterwards (they can only be removed again while they hold no data).`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/flat-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ towers: plan }) });
      await ctx.reloadFlats();
      setRows({});
      setMsg({ ok: true, text: `${r.created} flats created.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || "Not created." }); }
    setBusy(false);
  }

  const none = ctx.flats.length === 0;
  return (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 sm:p-4 grid gap-4 min-w-0">
      <div>
        <div className="serif text-[17px] font-bold">{none ? "CREATE THE FLATS" : "ADD FLATS TO A NEW TOWER"}</div>
        <div className="mono text-[11px] opacity-70 mt-1 leading-relaxed">
          {none ? "This society has no flats yet. " : "Only towers that have no flats yet are listed. To add a tower first, use TOWERS. "}
          For each tower choose: the same flats on every floor, or type the flat numbers floor by floor (for numbering that is not regular). Leave a tower empty to skip it.
        </div>
      </div>
      {free.length === 0 && <div className="mono text-[11px] opacity-70">Every tower already has flats. Add a new tower in TOWERS to add flats here.</div>}
      {free.map((t) => {
        const r = get(t.code);
        const tabs: [Row["mode"], string][] = [["same", "SAME ON EVERY FLOOR"], ["typed", "TYPE EACH FLOOR"]];
        return (
          <div key={t.code} className="border border-[var(--border)] bg-white rounded-[3px] p-3 grid gap-2.5 min-w-0">
            <div className="serif text-[16px] font-bold">{t.name} <span className="mono text-[11px] font-normal opacity-60">code {t.code}{t.terrace ? " • top floor terrace" : ""}</span></div>
            <div className="grid grid-cols-2 gap-2">
              {tabs.map(([k, label]) => <button key={k} onClick={() => set(t.code, { mode: k })} className={`min-h-[44px] mono text-[10px] font-semibold tracking-[0.06em] border rounded-[3px] px-2 ${r.mode === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--surface)] border-[var(--border)]"}`}>{label}</button>)}
            </div>
            {r.mode === "same" ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Field t="FLOORS"><input className="field" inputMode="numeric" value={r.floors} onChange={(e) => set(t.code, { floors: e.target.value })} /></Field>
                <Field t="FLATS PER FLOOR"><input className="field" inputMode="numeric" value={r.perFloor} onChange={(e) => set(t.code, { perFloor: e.target.value })} /></Field>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {r.typed.map((x, i) => (
                  <div key={i} className="grid grid-cols-[72px_1fr] gap-2.5 items-end min-w-0">
                    <Field t="FLOOR"><input className="field" inputMode="numeric" value={x.floor} onChange={(e) => setTyped(t.code, i, { floor: e.target.value })} /></Field>
                    <Field t={`FLAT NUMBERS (e.g. ${t.code}${x.floor || 1}01, ${t.code}${x.floor || 1}02)`}><input className="field" value={x.text} onChange={(e) => setTyped(t.code, i, { text: e.target.value })} /></Field>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => set(t.code, { typed: [...r.typed, { floor: String((Math.max(0, ...r.typed.map((x) => Number(x.floor) || 0)) || 0) + 1), text: "" }] })} className="btn-line mono text-[11px] px-4 min-h-[44px]">+ ADD FLOOR</button>
                  {r.typed.length > 1 && <button onClick={() => set(t.code, { typed: r.typed.slice(0, -1) })} className="btn-line mono text-[11px] px-4 min-h-[44px]">REMOVE LAST FLOOR</button>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
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
              {clash.length > 0 && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">Flat {clash.slice(0, 5).join(", ")}{clash.length > 5 ? " …" : ""} already exists, so these cannot be created.</div>}
              {warnings.map((w) => <div key={w} className="border border-amber-200 bg-[#fffbeb] p-2.5">{w}</div>)}
            </div>
          )}
        </div>
      )}

      {isMain === false && <div className="mono text-[10px] opacity-70">Only the main admin login can create flats.</div>}
      {isMain === true && free.length > 0 && (
        <div><button onClick={create} disabled={busy || blocked} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy ? "CREATING…" : `CREATE ${flatsList.length || ""} FLATS`.replace("  ", " ")}</button></div>
      )}
      {msg && <div className={`p-3 mono text-[11px] border ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </div>
  );
}
