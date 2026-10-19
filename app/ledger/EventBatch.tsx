"use client";
// EVENTS → event → ACCOUNTS → POST BY TOWER: member fund or member passes for a whole tower at once.
// Every flat not yet entered is ticked; the treasurer unticks flats that have not paid, checks amounts, and posts.
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { inr, today } from "@/lib/billing";
import { label, ownerText, residentName, type Flat } from "@/lib/society";
import { EV_MODES, type Money } from "@/lib/events";

type Row = { on: boolean; qty: string; jain: string; amount: string };

export default function EventBatch({ kind, eventId, occupied, done, people, price, email, onDone, onCancel }: {
  kind: "fund" | "passes"; eventId: string; occupied: Flat[]; done: Set<string>; people: Record<string, number>;
  price: number | null; email: string; onDone: (n: number) => void; onCancel: () => void;
}) {
  const towers = useMemo(() => Array.from(new Set(occupied.map((f) => f.tower || ""))).filter(Boolean).sort(), [occupied]);
  const [tower, setTower] = useState(towers[0] || "ALL");
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<Money["mode"]>("Cash");
  const [rate, setRate] = useState(price != null ? String(price) : "");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const list = occupied.filter((f) => (tower === "ALL" || f.tower === tower) && !done.has(f.id));
  const qtyOf = (id: string) => String(Math.max(1, people[id] || 1));
  const row = (id: string): Row => rows[id] || { on: true, qty: qtyOf(id), jain: "", amount: "" };
  const amountOf = (id: string) => { const r = row(id); if (r.amount) return Number(r.amount); return kind === "passes" ? Number(r.qty || 0) * Number(rate || 0) : Number(rate || 0); };
  const setRow = (id: string, p: Partial<Row>) => setRows((x) => ({ ...x, [id]: { ...row(id), ...p } }));
  const picked = list.filter((f) => row(f.id).on);
  const total = picked.reduce((s, f) => s + amountOf(f.id), 0);
  const allOn = (on: boolean) => setRows((x) => { const n = { ...x }; list.forEach((f) => { n[f.id] = { ...row(f.id), on }; }); return n; });

  async function post() {
    if (!picked.length) { setError("No flats ticked."); return; }
    const badJain = picked.find((f) => Number(row(f.id).jain || 0) > Number(row(f.id).qty || 0));
    if (kind === "passes" && badJain) { setError(`${label(badJain)}: Jain food is more than the passes.`); return; }
    if (picked.some((f) => !(amountOf(f.id) > 0))) { setError(`Enter the ${kind === "fund" ? "amount per flat" : "price per pass"}.`); return; }
    if (!confirm(`Post ${picked.length} ${kind === "fund" ? "member fund" : "member pass"} entries, total ₹${inr(total)}, dated ${date}?`)) return;
    setBusy(true); setError("");
    const ins = picked.map((f) => {
      const base = { event_id: eventId, direction: "in", entry_date: date, flat_id: f.id, mode, amount: amountOf(f.id), created_by: email, note: `Posted for Tower ${f.tower}` };
      return kind === "fund" ? { ...base, category: "Member fund" }
        : { ...base, category: "Passes", pass_type: "Member", purpose: "Member passes", qty: Number(row(f.id).qty || 1), jain_qty: Number(row(f.id).jain || 0) || null, rate: Number(rate || 0) };
    });
    const { error } = await supabase.from("event_money").insert(ins);
    setBusy(false);
    if (error) { setError(error.message); return; }
    onDone(ins.length);
  }

  return (
    <div className="border-2 border-emerald-600 bg-emerald-50/40 p-3 space-y-2.5 mono text-[11px]">
      <div className="font-bold tracking-[0.1em]">POST {kind === "fund" ? "MEMBER FUND" : "MEMBER PASSES"} BY TOWER</div>
      <div className="opacity-70">All flats not yet entered are ticked. Untick flats that have not paid, check the {kind === "fund" ? "amounts" : "number of passes"}, then post.{kind === "passes" ? " Passes default to the number of people living in the flat; enter how many of them want Jain food (the rest are normal)." : ""}</div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[10px] opacity-80">TOWER<select className="field mt-1 !w-auto" value={tower} onChange={(e) => setTower(e.target.value)}>
          {towers.map((t) => <option key={t} value={t}>Tower {t}</option>)}<option value="ALL">All towers</option></select></label>
        <label className="text-[10px] opacity-80">DATE<input type="date" className="field mt-1 !w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-[10px] opacity-80">MODE<select className="field mt-1 !w-auto" value={mode} onChange={(e) => setMode(e.target.value as Money["mode"])}>{EV_MODES.filter((m) => m !== "In kind").map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="text-[10px] opacity-80">{kind === "fund" ? "AMOUNT PER FLAT ₹" : "MEMBER PASS PRICE ₹"}<input className="field mt-1 !w-[110px] font-bold" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} /></label>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <b>{picked.length} of {list.length} ticked • ₹{inr(total)}{kind === "passes" ? (() => { const q = picked.reduce((s, f) => s + Number(row(f.id).qty || 0), 0), j = picked.reduce((s, f) => s + Number(row(f.id).jain || 0), 0); return ` • ${q} passes: ${q - j} normal, ${j} Jain`; })() : ""}</b>
        <button onClick={() => allOn(true)} className="underline">tick all</button><button onClick={() => allOn(false)} className="underline">untick all</button>
        {done.size > 0 && <span className="opacity-60">{list.length === 0 ? "All flats here are already entered." : `Flats already entered are not shown.`}</span>}
      </div>
      <div className={`grid gap-1.5 max-h-[420px] overflow-y-auto ${kind === "passes" ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {list.map((f) => { const r = row(f.id); return (
          <div key={f.id} className={`border p-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 ${r.on ? "border-emerald-300 bg-white" : "border-[var(--border)] bg-[var(--bg)] opacity-60"}`}>
            <input type="checkbox" checked={r.on} onChange={(e) => setRow(f.id, { on: e.target.checked })} aria-label={`Include ${label(f)}`} />
            <b className="w-[50px] shrink-0">{label(f)}</b><span className="flex-1 min-w-[110px] truncate">{residentName(f) || ownerText(f)}</span>
            <div className="flex items-center gap-2 ml-auto">
            {kind === "passes" && <>
              <span className="text-[9.5px] opacity-60">PASSES</span><input className="field !w-[42px] !py-0.5 text-center" inputMode="numeric" value={r.qty} title="Passes" aria-label="Passes" onChange={(e) => setRow(f.id, { qty: e.target.value.replace(/\D/g, ""), amount: "" })} />
              <label className="flex items-center gap-0.5 text-[9.5px] text-amber-800" title="How many want Jain food">JAIN<input className="field !w-[36px] !py-0.5 text-center" inputMode="numeric" placeholder="0" value={r.jain} aria-label="Jain" onChange={(e) => setRow(f.id, { jain: e.target.value.replace(/\D/g, "") })} /></label></>}
            <span className="w-[62px] text-right font-bold">₹{inr(amountOf(f.id))}</span>
            </div>
          </div>); })}
      </div>
      <div className="flex gap-2"><button onClick={post} disabled={busy || !picked.length} className="btn-navy px-4 py-2 font-bold">{busy ? "POSTING…" : `POST ${picked.length} ENTRIES`}</button><button onClick={onCancel} className="btn-line px-4 py-2">CANCEL</button></div>
    </div>
  );
}
