"use client";
// ADMIN → FLAT SETUP → FLOORS & FLATS: remove flats that hold NO data (one flat, or every flat of one tower). Main admin only.
// CHECK asks the server which flats hold data (the database decides, sql-security/15); DELETE is possible only when every chosen flat is empty,
// and the server checks again. Flats with an owner, family, bills, a login … can never be removed here.
import { useMemo, useState } from "react";
import { api } from "@/lib/ledgerClient";
import { label } from "@/lib/society";
import { canRemoveAll, removeText, type FlatBlocker } from "@/lib/flatRemove";
import type { Ctx } from "./ctx";
import { useIsMainAdmin } from "./SetupEditors";

export default function FlatRemover({ ctx }: { ctx: Ctx }) {
  const isMain = useIsMainAdmin();
  const [tower, setTower] = useState("");
  const [flat, setFlat] = useState("");
  const [rows, setRows] = useState<FlatBlocker[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const towers = useMemo(() => Array.from(new Set(ctx.flats.map((f) => String(f.tower ?? "").trim()).filter(Boolean))).sort(), [ctx.flats]);
  const cur = tower || towers[0] || "";
  const list = useMemo(() => ctx.flats.filter((f) => String(f.tower ?? "").trim() === cur).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [ctx.flats, cur]);
  if (isMain !== true || !towers.length) return null;
  const body = () => JSON.stringify(flat ? { flat } : { tower: cur });
  const reset = () => { setRows(null); setMsg(null); };

  async function check() {
    setBusy(true); setMsg(null);
    try { const r = await api("/api/flat-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body()), mode: "check" }) }); setRows(r.rows); }
    catch (e: any) { setRows(null); setMsg({ ok: false, text: e.message || "Could not check." }); }
    setBusy(false);
  }
  async function remove() {
    if (!rows || !canRemoveAll(rows)) return;
    if (!confirm(`Remove ${rows.length} flat${rows.length === 1 ? "" : "s"} (${flat ? label({ id: flat, flat_no: flat } as any) : `all of tower ${cur}`})? They hold no data. This cannot be undone.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/flat-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body()), mode: "delete" }) });
      await ctx.reloadFlats(); setRows(null); setFlat(""); setMsg({ ok: true, text: `${r.removed} flat${r.removed === 1 ? "" : "s"} removed.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || "Not removed." }); }
    setBusy(false);
  }

  const held = (rows || []).filter((r) => r.blockers);
  return (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 sm:p-4 grid gap-3 min-w-0">
      <div>
        <div className="serif text-[17px] font-bold">REMOVE FLATS THAT HOLD NO DATA</div>
        <div className="mono text-[11px] opacity-70 mt-1 leading-relaxed">For a flat created by mistake. A flat with an owner, family, vehicles, bills, receipts, bookings, complaints or a login is never removed here.</div>
      </div>
      <label className="block min-w-0"><div className="mono text-[10px] tracking-[0.1em] opacity-60 mb-1">TOWER</div>
        <select className="field" value={cur} onChange={(e) => { setTower(e.target.value); setFlat(""); reset(); }}>{towers.map((c) => <option key={c} value={c}>{`Tower ${c}`}</option>)}</select></label>
      <label className="block min-w-0"><div className="mono text-[10px] tracking-[0.1em] opacity-60 mb-1">WHICH FLATS</div>
        <select className="field" value={flat} onChange={(e) => { setFlat(e.target.value); reset(); }}>
          <option value="">{`All ${list.length} flats of tower ${cur}`}</option>
          {list.map((f) => <option key={f.id} value={f.id}>{label(f)}</option>)}
        </select></label>
      <div className="flex flex-wrap gap-2">
        <button onClick={check} disabled={busy} className="btn-line mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy && !rows ? "CHECKING…" : "CHECK"}</button>
        <button onClick={remove} disabled={busy || !rows || !canRemoveAll(rows)} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">REMOVE</button>
      </div>
      {rows && (
        <div className={`border p-3 mono text-[11px] leading-relaxed min-w-0 ${held.length ? "border-amber-200 bg-[#fffbeb]" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {removeText(rows)}
          {held.slice(0, 8).map((r) => <div key={r.flat_id} className="mt-1 break-words"><b>{label({ id: r.flat_id, flat_no: r.flat_id } as any)}</b>: {r.blockers}</div>)}
          {held.length > 8 && <div className="mt-1">… and {held.length - 8} more.</div>}
        </div>
      )}
      {msg && <div className={`p-3 mono text-[11px] border ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </div>
  );
}
