"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { familySummary, label, sortFlats, type MemberLite } from "@/lib/society";
import {
  addDays, billBalance, billHtml, currentPeriodKey, dmy, flatTotals, inr, loadSettings, loadSignatories, monthsIn, num, openPrint,
  OTHER_PRESETS, periodOf, periodOptions, reserveNumbers, today, waLink, duesText, statementPdf, duesListPdf, type Bill, type Payment, type PrintCtx, type Settings, type Signatory,
} from "@/lib/billing";
import type { Ctx } from "../ctx";
import SharePdfButton from "./SharePdfButton";
import LedgerCard from "./LedgerCard";
import BillingSettings from "./BillingSettings";
import { backBar } from "@/lib/printBack";

const VIEWS = ["LEDGER", "NEW BILLS", "OTHER BILL", "DUES", "SETTINGS"] as const;
type View = (typeof VIEWS)[number];

export default function BillingTab({ ctx }: { ctx: Ctx }) {
  const flats = useMemo(() => [...ctx.flats].sort(sortFlats), [ctx.flats]);
  const [view, setView] = useState<View>("LEDGER");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [flatId, setFlatId] = useState<string>(ctx.selectedId || flats[0]?.id || "");

  async function load() {
    const [s, sg, b, p, m] = await Promise.all([
      loadSettings(), loadSignatories(),
      supabase.from("bills").select("*").order("bill_date"), supabase.from("payments").select("*").order("paid_on"),
      supabase.from("members").select("flat_id,name,relation,mobile,is_head"),
    ]);
    setReady(!!s && !b.error);
    setSettings(s); setSignatories(sg); setBills((b.data as Bill[]) || []); setPays((p.data as Payment[]) || []); setMembers((m.data as MemberLite[]) || []);
  }
  useEffect(() => { load(); }, []);

  const pc: PrintCtx = { settings, signatories, flats };
  const mobileOf = (id: string) => { const f = flats.find((x) => x.id === id); if (!f) return null; const x = familySummary(f, members); return x.head?.mobile || x.mobile || (f as any).owner_mobile || null; };
  const openLedger = (id: string) => { setFlatId(id); setView("LEDGER"); window.scrollTo({ top: 0 }); };

  if (ready === false) return <div className="border border-dashed border-[var(--border)] p-8 text-center mono text-[12px] opacity-70">Billing needs its one-time database step (BILLING.sql) to be run in Supabase.</div>;
  if (ready === null || !settings) return <div className="mono text-[12px] opacity-60 p-6">Loading billing…</div>;

  const idx = flats.findIndex((f) => f.id === flatId);
  const flat = flats[idx] || flats[0];
  const totals = flatTotals(bills, pays);
  const dueFlats = flats.filter((f) => flatTotals(bills.filter((b) => b.flat_id === f.id), pays).due > 0).length;

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 flex flex-wrap justify-between gap-4 items-center">
        <div>
          <div className="serif text-[22px] font-bold">Billing</div>
          <div className="mono text-[11px] opacity-60">Billed ₹{inr(totals.billed)} • Received ₹{inr(totals.received)} • Outstanding <b className="text-amber-700">₹{inr(totals.due)}</b> in {dueFlats} flats</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => <button key={v} onClick={() => setView(v)} className={`mono text-[11px] font-bold tracking-[0.06em] px-3 py-2 border rounded-[3px] ${view === v ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--gold)]"}`}>{v}</button>)}
        </div>
      </div>

      {view === "LEDGER" && flat && (
        <LedgerCard flat={flat} bills={bills} pays={pays} pc={pc} editable email={ctx.email} mobile={mobileOf(flat.id)} onChanged={load}
          nav={<>
            <button disabled={idx <= 0} onClick={() => setFlatId(flats[idx - 1].id)} className="btn-line mono text-[11px] px-2.5 py-1 disabled:opacity-40">‹ {idx > 0 ? label(flats[idx - 1]) : ""}</button>
            <select className="field !w-auto !py-1 mono text-[11px]" value={flat.id} onChange={(e) => setFlatId(e.target.value)}>
              {flats.map((f) => { const d = flatTotals(bills.filter((b) => b.flat_id === f.id), pays).due; return <option key={f.id} value={f.id}>{label(f)} • {f.owner_name || "—"}{d > 0 ? ` • due ₹${inr(d)}` : ""}</option>; })}
            </select>
            <button disabled={idx >= flats.length - 1} onClick={() => setFlatId(flats[idx + 1].id)} className="btn-line mono text-[11px] px-2.5 py-1 disabled:opacity-40">{idx < flats.length - 1 ? label(flats[idx + 1]) : ""} ›</button>
          </>} />
      )}
      {view === "NEW BILLS" && <BillRun ctx={ctx} flats={flats} bills={bills} settings={settings} signatories={signatories} pc={pc} pays={pays} onDone={load} />}
      {view === "OTHER BILL" && <OtherBill ctx={ctx} flats={flats} settings={settings} signatories={signatories} pc={pc} pays={pays} bills={bills} onDone={load} />}
      {view === "DUES" && <Dues flats={flats} bills={bills} pays={pays} mobileOf={mobileOf} open={openLedger} pc={pc} />}
      {view === "SETTINGS" && <BillingSettings settings={settings} signatories={signatories} email={ctx.email} onChanged={load} />}
    </div>
  );
}

const signerOf = (sg: Signatory[], id: string | null) => { const s = sg.find((x) => x.id === id); return { signer_id: s?.id || null, signer_name: s?.name || null, signer_designation: s?.designation || null }; };
const prevDue = (b: Bill, bills: Bill[], pays: Payment[]) => bills.filter((x) => x.flat_id === b.flat_id && x.status === "active" && x.id !== b.id && x.bill_date < b.bill_date).reduce((n, x) => n + Math.max(0, billBalance(x, pays).balance), 0);

// ---------- Half-yearly maintenance bill run ----------
function BillRun({ ctx, flats, bills, settings, signatories, pc, pays, onDone }: { ctx: Ctx; flats: any[]; bills: Bill[]; settings: Settings; signatories: Signatory[]; pc: PrintCtx; pays: Payment[]; onDone: () => Promise<void> | void }) {
  const [pk, setPk] = useState(currentPeriodKey());
  const per = periodOf(pk);
  const [billDate, setBillDate] = useState(per.billDate);
  const [tower, setTower] = useState("ALL");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [signer, setSigner] = useState(settings.bill_signer || "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [made, setMade] = useState<Bill[]>([]);
  const months = monthsIn(per.from, per.to);
  const already = (id: string) => bills.some((b) => b.flat_id === id && b.kind === "maintenance" && b.status === "active" && b.period_from === per.from);
  const rows = flats.filter((f) => tower === "ALL" || f.tower === tower);
  useEffect(() => { setBillDate(periodOf(pk).billDate); setMade([]); }, [pk]);
  useEffect(() => { setPicked(new Set(rows.filter((f) => !already(f.id) && num(f.maintenance) > 0).map((f) => f.id))); }, [pk, tower, bills.length]);
  const chosen = rows.filter((f) => picked.has(f.id));
  const total = chosen.reduce((n, f) => n + num(f.maintenance) * months, 0);
  const due = addDays(billDate, settings.due_days || 30);

  async function generate() {
    if (!chosen.length) return;
    if (!confirm(`Create ${chosen.length} maintenance bills for ${per.label} (total ₹${inr(total)})?\nBill date ${dmy(billDate)}, due ${dmy(due)}.`)) return;
    setBusy(true); setError("");
    try {
      const nos = await reserveNumbers("bill", chosen.length);
      const rowsIns = chosen.map((f, i) => ({
        bill_no: nos[i], flat_id: f.id, kind: "maintenance", bill_to: f.owner_name, bill_date: billDate, due_date: due, period_from: per.from, period_to: per.to,
        lines: [{ description: "Maintenance charges", rate: num(f.maintenance), qty: months, amount: num(f.maintenance) * months }],
        amount: num(f.maintenance) * months, ...signerOf(signatories, signer || null), created_by: ctx.email,
      }));
      const { data, error } = await supabase.from("bills").insert(rowsIns).select("*");
      if (error) throw error;
      setMade((data as Bill[]) || []); await onDone();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  const printMade = () => openPrint(`Bills ${per.label}`, made.map((b) => billHtml(b, pc, prevDue(b, [...bills, ...made], pays))));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px] space-y-3">
      <div className="serif text-[18px] font-bold">New maintenance bills</div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-[10px] opacity-80">PERIOD<select className="field mt-1 !w-[220px]" value={pk} onChange={(e) => setPk(e.target.value)}>{periodOptions().map((k) => <option key={k} value={k}>{periodOf(k).label} (bill {dmy(periodOf(k).billDate)})</option>)}</select></label>
        <label className="text-[10px] opacity-80">BILL DATE<input type="date" className="field mt-1 !w-[150px]" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></label>
        <div className="text-[10px] opacity-80">DUE DATE<div className="field mt-1 !w-[130px] bg-[var(--bg)]">{dmy(due)}</div></div>
        <label className="text-[10px] opacity-80">TOWERS<select className="field mt-1 !w-[120px]" value={tower} onChange={(e) => setTower(e.target.value)}><option value="ALL">All</option><option>A</option><option>B</option><option>C</option></select></label>
        <label className="text-[10px] opacity-80">SIGNED BY<select className="field mt-1 !w-[190px]" value={signer} onChange={(e) => setSigner(e.target.value)}><option value="">— blank line —</option>{signatories.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.designation} – {s.name}</option>)}</select></label>
      </div>
      <div className="opacity-70">Each flat is billed its monthly maintenance × {months} months. Flats already billed for this period are skipped. Bill to: owner. Next bill no.: <b>{settings.bill_prefix}{String(settings.bill_last_no + 1).padStart(settings.num_digits, "0")}</b></div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
      {made.length > 0 && (
        <div className="border border-emerald-300 bg-emerald-50 p-3 flex flex-wrap gap-3 items-center justify-between">
          <span className="font-bold text-emerald-800">✓ {made.length} bills created ({made[0].bill_no} to {made[made.length - 1].bill_no}).</span>
          <button onClick={printMade} className="btn-navy px-4 py-2">PRINT ALL {made.length} BILLS</button>
        </div>
      )}
      <div className="border border-[var(--border)] max-h-[440px] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0"><tr className="bg-[var(--navy)] text-white text-left mono text-[10px]">
            <th className="px-2 py-2"><input type="checkbox" checked={chosen.length > 0 && chosen.length === rows.filter((f) => !already(f.id)).length} onChange={(e) => setPicked(new Set(e.target.checked ? rows.filter((f) => !already(f.id)).map((f) => f.id) : []))} /></th>
            <th className="px-2 py-2">FLAT</th><th className="px-2 py-2">BILL TO (OWNER)</th><th className="px-2 py-2 text-right">₹ / MONTH</th><th className="px-2 py-2 text-right">AMOUNT</th><th className="px-2 py-2">NOTE</th></tr></thead>
          <tbody>{rows.map((f) => { const done = already(f.id); return (
            <tr key={f.id} className={`border-b border-[var(--border)] ${done ? "opacity-50" : ""}`}>
              <td className="px-2 py-1.5"><input type="checkbox" disabled={done} checked={picked.has(f.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} /></td>
              <td className="px-2 py-1.5 font-bold">{label(f)}</td><td className="px-2 py-1.5">{f.owner_name || <span className="text-amber-700">owner not recorded</span>}</td>
              <td className="px-2 py-1.5 text-right">{inr(f.maintenance)}</td><td className="px-2 py-1.5 text-right font-bold">{inr(num(f.maintenance) * months)}</td>
              <td className="px-2 py-1.5 opacity-70">{done ? "already billed" : !num(f.maintenance) ? "no maintenance set" : ""}</td></tr>); })}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px]"><b>{chosen.length}</b> flats selected • total <b>₹{inr(total)}</b></div>
        <button onClick={generate} disabled={busy || !chosen.length} className="btn-navy px-5 py-2.5 tracking-[0.08em] disabled:opacity-50">{busy ? "CREATING…" : `CREATE ${chosen.length} BILLS`}</button>
      </div>
    </div>
  );
}

// ---------- One-off bills ----------
function OtherBill({ ctx, flats, settings, signatories, pc, pays, bills, onDone }: { ctx: Ctx; flats: any[]; settings: Settings; signatories: Signatory[]; pc: PrintCtx; pays: Payment[]; bills: Bill[]; onDone: () => Promise<void> | void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [lines, setLines] = useState([{ description: OTHER_PRESETS[0], amount: "" }]);
  const [billDate, setBillDate] = useState(today());
  const [signer, setSigner] = useState(settings.bill_signer || "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [made, setMade] = useState<Bill[]>([]);
  const due = addDays(billDate, settings.due_days || 30);
  const amount = lines.reduce((n, l) => n + num(l.amount), 0);
  const list = flats.filter((f) => !q || label(f).toLowerCase().includes(q.toLowerCase()) || (f.owner_name || "").toLowerCase().includes(q.toLowerCase()));
  const setLine = (i: number, k: string, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function create() {
    if (!picked.size) { setError("Choose at least one flat."); return; }
    if (lines.some((l) => !l.description.trim() || !(num(l.amount) > 0))) { setError("Each line needs a description and an amount."); return; }
    const fl = flats.filter((f) => picked.has(f.id));
    if (!confirm(`Create ${fl.length} bill(s) of ₹${inr(amount)} each?`)) return;
    setBusy(true); setError("");
    try {
      const nos = await reserveNumbers("other", fl.length);
      const ls = lines.map((l) => ({ description: l.description.trim(), amount: num(l.amount) }));
      const { data, error } = await supabase.from("bills").insert(fl.map((f, i) => ({
        bill_no: nos[i], flat_id: f.id, kind: "other", bill_to: f.occupancy === "tenant" && f.tenant_name ? f.tenant_name : f.owner_name, bill_date: billDate, due_date: due,
        lines: ls, amount, ...signerOf(signatories, signer || null), created_by: ctx.email,
      }))).select("*");
      if (error) throw error;
      setMade((data as Bill[]) || []); setPicked(new Set()); await onDone();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px] space-y-3">
      <div className="serif text-[18px] font-bold">Other (one-off) bill</div>
      <div className="opacity-70">For lift usage, common plot booking, repairs, or an opening balance carried over from the old register. Receipts work the same as maintenance. Rented flats are billed to the tenant (change on the bill if needed).</div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
      {made.length > 0 && (
        <div className="border border-emerald-300 bg-emerald-50 p-3 flex flex-wrap gap-3 items-center justify-between">
          <span className="font-bold text-emerald-800">✓ {made.length} bill(s) created: {made.map((b) => b.bill_no).join(", ")}</span>
          <button onClick={() => openPrint("Bills", made.map((b) => billHtml(b, pc, prevDue(b, [...bills, ...made], pays))))} className="btn-navy px-4 py-2">PRINT</button>
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
        <div>
          <div className="flex gap-2 items-center"><b className="text-[10px] tracking-[0.12em]">FLATS • {picked.size} chosen</b><input className="field !w-[180px] !py-1" placeholder="Search flat / name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="border border-[var(--border)] max-h-[320px] overflow-auto mt-2 bg-white">
            {list.map((f) => (
              <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg)]">
                <input type="checkbox" checked={picked.has(f.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} />
                <b className="w-14">{label(f)}</b><span className="truncate">{f.owner_name || "—"}{f.occupancy === "tenant" ? ` (tenant: ${f.tenant_name || ""})` : ""}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <b className="text-[10px] tracking-[0.12em]">CHARGES</b>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input className="field flex-1" list="other-presets" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder="Description, e.g. Common plot booking 12 Nov" />
              <input className="field !w-[110px] text-right" inputMode="decimal" placeholder="₹ amount" value={l.amount} onChange={(e) => setLine(i, "amount", e.target.value)} />
              {lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-red-600">✕</button>}
            </div>
          ))}
          <datalist id="other-presets">{OTHER_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
          <button onClick={() => setLines((ls) => [...ls, { description: "", amount: "" }])} className="underline">+ add another line</button>
          <div className="flex flex-wrap gap-3 pt-2">
            <label className="text-[10px] opacity-80">BILL DATE<input type="date" className="field mt-1 !w-[150px]" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></label>
            <div className="text-[10px] opacity-80">DUE DATE<div className="field mt-1 !w-[130px] bg-[var(--bg)]">{dmy(due)}</div></div>
            <label className="text-[10px] opacity-80">SIGNED BY<select className="field mt-1 !w-[190px]" value={signer} onChange={(e) => setSigner(e.target.value)}><option value="">— blank line —</option>{signatories.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.designation} – {s.name}</option>)}</select></label>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[12px]">Each bill: <b>₹{inr(amount)}</b> • Next no.: <b>{settings.other_prefix}{String(settings.other_last_no + 1).padStart(settings.num_digits, "0")}</b></span>
            <button onClick={create} disabled={busy} className="btn-navy px-5 py-2.5">{busy ? "CREATING…" : `CREATE ${picked.size || ""} BILL${picked.size === 1 ? "" : "S"}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Dues list ----------
function Dues({ flats, bills, pays, mobileOf, open, pc }: { flats: any[]; bills: Bill[]; pays: Payment[]; mobileOf: (id: string) => string | null; open: (id: string) => void; pc: PrintCtx }) {
  const [tower, setTower] = useState("ALL");
  const rows = flats.filter((f) => tower === "ALL" || f.tower === tower).map((f) => {
    const fb = bills.filter((b) => b.flat_id === f.id && b.status === "active");
    const open_ = fb.filter((b) => billBalance(b, pays).balance > 0);
    return { f, due: flatTotals(fb, pays).due, count: open_.length, oldest: open_.map((b) => b.due_date || b.bill_date).sort()[0] };
  }).filter((r) => r.due > 0).sort((a, b) => b.due - a.due);
  const total = rows.reduce((n, r) => n + r.due, 0);
  const overdue = (d?: string) => !!d && d < today();
  function print() {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>Dues list</title><style>body{font-family:Inter,Arial;margin:24px;color:#1a1a18}h1{color:#0f1d3d;font-size:17px;margin:0}.s{font-size:11px;color:#6f6a5d;margin:4px 0 12px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0f1d3d;color:#fff;text-align:left;padding:6px}td{padding:5px 6px;border-bottom:1px solid #e8e2d1}.r{text-align:right}tfoot td{font-weight:800;background:#f7f2e4}@page{size:A4;margin:12mm}</style></head><body>${backBar()}
      <h1>ॐ AAKAR CO-OP HOUSING SOCIETY LTD. — DUES LIST</h1><div class="s">${tower === "ALL" ? "All towers" : "Tower " + tower} • as on ${dmy(today())} • ${rows.length} flats</div>
      <table><thead><tr><th>Flat</th><th>Owner</th><th>Mobile</th><th>Unpaid bills</th><th>Oldest due date</th><th class="r">Amount due ₹</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${label(r.f)}</b></td><td>${r.f.owner_name || ""}</td><td>${mobileOf(r.f.id) || ""}</td><td>${r.count}</td><td>${dmy(r.oldest)}</td><td class="r">${inr(r.due)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5">TOTAL</td><td class="r">${inr(total)}</td></tr></tfoot></table><script>setTimeout(()=>print(),400)</script></body></html>`);
    w.document.close();
  }
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px] space-y-3">
      <div className="border-2 border-[var(--gold)] bg-[#fffbeb] rounded-[6px] p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div>
            <div className="text-[10px] font-bold tracking-[0.16em] text-[#8a6d14]">FULL DUES LIST • FOR THE COMMITTEE</div>
            <div className="serif text-[22px] font-bold mt-1">Full dues list — {tower === "ALL" ? "All towers" : `Tower ${tower}`}</div>
            <div className="opacity-70 mt-0.5">{rows.length} flat{rows.length === 1 ? " owes" : "s owe"} <b className="text-amber-700">₹{inr(total)}</b> • as on {dmy(today())}</div>
          </div>
          <label className="text-[10px] font-bold tracking-[0.1em]">SHOW<select className="field !w-[150px] !py-1.5 mt-1 block" value={tower} onChange={(e) => setTower(e.target.value)}><option value="ALL">All towers</option><option value="A">Tower A</option><option value="B">Tower B</option><option value="C">Tower C</option></select></label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={print} disabled={!rows.length} className="btn-navy px-5 py-2.5 text-[12px] tracking-[0.06em]">🖨 PRINT FULL DUES LIST</button>
          {rows.length > 0 && <SharePdfButton key={tower} label="📋 FULL DUES LIST PDF" className="px-5 py-2.5 text-[12px] tracking-[0.06em] font-bold text-white bg-[#128c48] border border-[#128c48]"
            make={() => duesListPdf(rows, tower === "ALL" ? "All towers" : `Tower ${tower}`)}
            text={`Aakar Co-op Housing Society: full dues list (${tower === "ALL" ? "all towers" : "Tower " + tower}) as on ${dmy(today())} — ${rows.length} flats, total ₹${inr(total)}.`} />}
          <span className="opacity-70">Share only with the committee — it shows every flat's dues.</span>
        </div>
      </div>
      <div className="text-[10px] font-bold tracking-[0.16em] pt-1">ONE FLAT AT A TIME • SEND TO THAT MEMBER</div>
      <div className="border border-[var(--border)] overflow-x-auto">
        <table className="w-full text-[12px] min-w-[700px]">
          <thead><tr className="bg-[var(--navy)] text-white text-left mono text-[10px]"><th className="px-2.5 py-2">FLAT</th><th className="px-2.5 py-2">OWNER</th><th className="px-2.5 py-2">MOBILE</th><th className="px-2.5 py-2">UNPAID BILLS</th><th className="px-2.5 py-2">OLDEST DUE</th><th className="px-2.5 py-2 text-right">DUE ₹</th><th className="px-2.5 py-2">SEND TO MEMBER</th></tr></thead>
          <tbody>{rows.map((r) => { const m = mobileOf(r.f.id); return (
            <tr key={r.f.id} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
              <td className="px-2.5 py-2"><button onClick={() => open(r.f.id)} className="font-bold underline text-[var(--navy)]">{label(r.f)}</button></td>
              <td className="px-2.5 py-2">{r.f.owner_name || "—"}</td><td className="px-2.5 py-2">{m || <span className="opacity-40">—</span>}</td>
              <td className="px-2.5 py-2">{r.count}</td><td className={`px-2.5 py-2 ${overdue(r.oldest) ? "text-red-700 font-bold" : ""}`}>{dmy(r.oldest)}{overdue(r.oldest) ? " • overdue" : ""}</td>
              <td className="px-2.5 py-2 text-right font-bold text-amber-700">{inr(r.due)}</td>
              <td className="px-2.5 py-2"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap">
                {m ? <a target="_blank" rel="noopener noreferrer" className="underline" href={waLink(m, duesText(r.f, bills, pays, pc.settings))}title="Opens WhatsApp to this member with an itemised reminder and bank details">📲 Reminder text</a> : <span className="opacity-40">no mobile</span>}
                <SharePdfButton label="📄 Statement PDF" className="underline" make={() => statementPdf(r.f, bills.filter((b) => b.flat_id === r.f.id), pays.filter((p) => p.flat_id === r.f.id), pc)}
                  text={`Aakar Co-op Housing Society: ledger statement for Flat ${label(r.f)} as on ${dmy(today())}. Balance due ₹${inr(r.due)}.`} />
              </div></td>
            </tr>); })}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center opacity-60">No dues. Every bill is paid.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
