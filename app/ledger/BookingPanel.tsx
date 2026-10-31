"use client";
// Common plot bookings (item 21; charges and full day only from BOOKING_CHARGES.sql). Phone first.
//  • four areas, whole day only; each area has a charge per day set by the Chairman, Secretary or main admin
//  • on approval the database raises one invoice (OTHER BILL series) in the name of whoever booked: owner or tenant
//  • mode "flat"      (MY FLAT → BOOK COMMON PLOT): ask for a booking, my bookings, and — for the Chairman / Secretary — requests to approve
//  • mode "committee" (COMMITTEE → BOOKINGS): waiting / upcoming / past, approve or reject, cancel, WhatsApp, print list
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { familySummary, type Flat, type MemberLite } from "@/lib/society";
import { waLink } from "@/lib/billing";
import { backBar } from "@/lib/printBack";
import { addDays, chargeOf, dayText, flatLabel, groupRows, invoiceText, istToday, memberCanCancel, noticeText, rupees, slotName, sortAreas, STATUS, takenBy, totalFor, type Area, type BookingRow, type Group, type Taken } from "@/lib/bookings";

type Props = { mode: "flat" | "committee"; flats: Flat[]; flatId: string | null; isCommittee: boolean; onCount?: (n: number) => void };
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const missing = (m: string) => /booking|schema cache|does not exist/i.test(m);

export default function BookingPanel({ mode, flats, flatId, isCommittee, onCount }: Props) {
  const [areas, setAreas] = useState<Area[] | null | undefined>(undefined);
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [taken, setTaken] = useState<Taken[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [canCharge, setCanCharge] = useState(false);
  const [invoices, setInvoices] = useState<Record<string, { bill_no: string; amount: number; status: string; paid: number }>>({});
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [err, setErr] = useState(""); const [view, setView] = useState<"waiting" | "upcoming" | "past">("waiting");
  const today = istToday();

  async function load() {
    const a = await supabase.from("booking_areas").select("*").eq("active", true).order("sort");
    if (a.error) { setAreas(missing(a.error.message) ? null : []); return; }
    const [b, t, c, cc] = await Promise.all([
      supabase.from("bookings").select("*").order("book_date", { ascending: true }).order("created_at"),
      supabase.rpc("booked_slots", { p_from: addDays(today, -1), p_to: addDays(today, 120) }),
      supabase.rpc("can_approve_booking"),
      supabase.rpc("can_set_booking_charge"),
    ]);
    setCanCharge(!!cc.data);
    // invoice numbers (and what is paid) for bookings that were invoiced
    const ids = Array.from(new Set(((b.data as BookingRow[]) || []).map((r) => r.bill_id).filter(Boolean))) as string[];
    if (ids.length) {
      const [bl, py] = await Promise.all([supabase.from("bills").select("id,bill_no,amount,status").in("id", ids), supabase.from("payments").select("bill_id,amount,status").in("bill_id", ids)]);
      const m: Record<string, { bill_no: string; amount: number; status: string; paid: number }> = {};
      for (const x of (bl.data as any[]) || []) m[x.id] = { bill_no: x.bill_no, amount: Number(x.amount), status: x.status, paid: 0 };
      for (const x of (py.data as any[]) || []) if (x.status === "active" && m[x.bill_id]) m[x.bill_id].paid += Number(x.amount);
      setInvoices(m);
    } else setInvoices({});
    setAreas(sortAreas((a.data as Area[]) || [])); setRows((b.data as BookingRow[]) || []); setTaken((t.data as Taken[]) || []); setCanApprove(!!c.data);
    const waiting = groupRows((b.data as BookingRow[]) || []).filter((g) => g.status === "pending").length;
    onCount?.(c.data || mode === "committee" ? waiting : 0);
  }
  useEffect(() => { load(); }, [flatId]);
  useEffect(() => { if (mode === "committee") supabase.from("members").select("*").then(({ data }) => setMembers((data as MemberLite[]) || [])); }, [mode]);
  const mobileOf = (id: string) => { const f = flats.find((x) => x.id === id); if (!f) return null; const x = familySummary(f, members); return x.head?.mobile || x.mobile || (f as any).owner_mobile || null; };

  const groups = useMemo(() => groupRows(rows), [rows]);
  if (areas === undefined) return mode === "committee" ? <div className="mono text-[12px] opacity-60 p-6">Loading…</div> : null;
  if (areas === null) return mode === "committee" ? <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[12px]">Run <b>BOOKINGS.sql</b> in Supabase to turn on common plot bookings.</div> : null;
  if (areas.length && areas[0].charge === undefined) return mode === "committee" ? <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[12px]">Run <b>BOOKING_CHARGES.sql</b> in Supabase to turn on booking charges (full day, four areas).</div> : null;

  async function decide(g: Group, approve: boolean) {
    let reason: string | null = null;
    if (!approve) { reason = prompt(`Reason for not approving (the member sees this):`, ""); if (reason === null) return; }
    setErr("");
    const { error } = await supabase.rpc("decide_booking", { p_group: g.group_id, p_approve: approve, p_reason: reason });
    if (error) setErr(error.message); else load();
  }
  async function cancel(g: Group) {
    const inv = g.bill_id ? invoices[g.bill_id] : null;
    const note = inv ? `\n\nInvoice ${inv.bill_no} (${rupees(inv.amount)}) will be cancelled, no charge.${inv.paid > 0 ? `\nIT IS ALREADY PAID (${rupees(inv.paid)}): refund the member outside the app.` : ""}` : "";
    const reason = prompt(`Cancel the booking of ${g.areas.join(", ")} on ${dayText(g.book_date)} (${slotName(g.slot).toLowerCase()})?${note}\n\nReason (optional):`, "");
    if (reason === null) return;
    setErr("");
    const { error } = await supabase.rpc("cancel_booking", { p_group: g.group_id, p_reason: reason });
    if (error) setErr(error.message); else load();
  }

  const card = (g: Group, actions: { approve?: boolean; cancel?: boolean; wa?: boolean }) => (
    <div key={g.group_id} className="border border-[var(--border)] bg-white p-3 mono text-[12px]">
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0"><div className="font-bold text-[13px]">{dayText(g.book_date)} • {slotName(g.slot)}</div>
          <div className="mt-0.5"><b className="text-[var(--navy)]">{g.areas.length >= areas.length ? "ALL AREAS" : g.areas.join(", ")}</b> • Flat {flatLabel(g.flat_id)}</div></div>
        <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-bold ${STATUS[g.status].cls}`}>{STATUS[g.status].text}</span>
      </div>
      {g.purpose && <div className="mt-1.5 text-[12.5px]">{g.purpose}</div>}
      <div className="mt-1.5 text-[12px]">{g.free_event ? <b>Society event • no charge</b> : g.total > 0 ? <>Charge <b>{rupees(g.total)}</b>{g.booked_by === "tenant" ? " • to the tenant" : ""}</> : <span className="opacity-70">No charge</span>}</div>
      {g.bill_id && invoices[g.bill_id] && (() => { const v = invoices[g.bill_id!]; return (
        <div className={`mt-1 text-[12px] ${v.status === "cancelled" ? "text-gray-500 line-through" : "text-[var(--navy)]"}`}>
          Invoice <b>{v.bill_no}</b> • {rupees(v.amount)}{v.status === "cancelled" ? " • cancelled, no charge" : v.paid >= v.amount ? " • paid" : v.paid > 0 ? ` • ${rupees(v.paid)} paid` : " • unpaid"}
          {g.status === "cancelled" && v.paid > 0 && actions.wa && <span className="block text-red-700 no-underline font-bold" style={{ textDecoration: "none" }}>REFUND DUE {rupees(v.paid)}: pay the member outside the app.</span>}
        </div>); })()}
      {g.reason && (g.status === "rejected" || g.status === "cancelled") && <div className="mt-1 text-[12px] text-red-700">Reason: {g.reason}</div>}
      {g.status === "approved" && <div className="mt-1 text-[11px] text-emerald-800">Notice and login banner posted for all members.</div>}
      {(actions.approve || actions.cancel || actions.wa) && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-2">
          {actions.approve && g.status === "pending" && <><button onClick={() => decide(g, true)} className="btn-navy px-4 py-2.5 font-bold">APPROVE ✓</button>
            <button onClick={() => decide(g, false)} className="btn-line px-4 py-2.5 text-red-700">NOT APPROVE</button></>}
          {actions.cancel && <button onClick={() => cancel(g)} className="btn-line px-4 py-2.5">CANCEL BOOKING</button>}
          {actions.wa && g.status === "approved" && <a href={waLink("", noticeText(g, areas.length))} target="_blank" rel="noopener noreferrer" className="btn-line px-4 py-2.5">📲 SHARE NOTICE</a>}
          {actions.wa && g.status === "approved" && g.bill_id && invoices[g.bill_id] && mobileOf(g.flat_id) && <a href={waLink(mobileOf(g.flat_id), invoiceText(g, invoices[g.bill_id].bill_no))} target="_blank" rel="noopener noreferrer" className="btn-line px-4 py-2.5">📲 SEND INVOICE</a>}
          {actions.wa && g.status !== "pending" && mobileOf(g.flat_id) && <a href={waLink(mobileOf(g.flat_id), `Aakar society: your booking of ${g.areas.join(", ")} on ${dayText(g.book_date)} (${slotName(g.slot).toLowerCase()}) is ${STATUS[g.status].text}.${g.bill_id && invoices[g.bill_id] && g.status === "approved" ? ` Invoice ${invoices[g.bill_id].bill_no}: ${rupees(g.total)}.` : ""}${g.reason ? ` Reason: ${g.reason}` : ""}`)} target="_blank" rel="noopener noreferrer" className="btn-line px-4 py-2.5">📲 TELL MEMBER</a>}
        </div>)}
    </div>);

  if (mode === "committee") {
    const lists = { waiting: groups.filter((g) => g.status === "pending"), upcoming: groups.filter((g) => g.status === "approved" && g.book_date >= today),
      past: groups.filter((g) => !(g.status === "pending" || (g.status === "approved" && g.book_date >= today))).reverse() };
    const shown = lists[view];
    const print = () => {
      const w = window.open("", "_blank"); if (!w) { alert("Please allow pop-ups to print."); return; }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bookings</title><style>body{font:12px Arial,sans-serif;margin:0 12px}h1{font-size:15px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#0f1d3d;color:#fff}</style></head><body>${backBar()}
        <h1>AAKAR CO-OP HOUSING SOCIETY LTD. — COMMON PLOT BOOKINGS (confirmed, from ${esc(dayText(today))})</h1>
        <table><tr><th>Date</th><th>Area</th><th>Flat</th><th>Purpose</th><th>Charge</th></tr>${lists.upcoming.map((g) => `<tr><td>${esc(dayText(g.book_date))}${g.slot === "day" ? "" : " (" + esc(slotName(g.slot)) + ")"}</td><td>${esc(g.areas.length >= areas!.length ? "ALL AREAS" : g.areas.join(", "))}</td><td>${esc(flatLabel(g.flat_id))}</td><td>${esc(g.purpose || "")}</td><td>${esc(g.free_event ? "Society event" : g.total > 0 ? rupees(g.total) : "—")}</td></tr>`).join("")}</table></body></html>`);
      w.document.close();
    };
    return (
      <div className="space-y-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] p-3 sm:p-4 mono text-[12px]">
          <div className="flex flex-wrap gap-2 items-center">
            {(["waiting", "upcoming", "past"] as const).map((k) => (
              <button key={k} onClick={() => setView(k)} className={`px-3 py-2 border rounded-[3px] font-bold ${view === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>
                {k === "waiting" ? "WAITING" : k === "upcoming" ? "CONFIRMED" : "PAST / OTHER"} <span className="opacity-70">{lists[k].length}</span></button>))}
            <button onClick={print} className="btn-line px-3 py-2 ml-auto">PRINT LIST</button>
          </div>
          <div className="mt-2 text-[11px] opacity-70">{canApprove ? "You can approve: the Chairman or the Secretary approves; either one is enough." : "Only the Chairman or the Secretary approves, from their own committee login. You can see and cancel bookings."}</div>
        </div>
        {canCharge && <ChargesBox areas={areas} onDone={load} />}
        {err && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[12px]">{err}</div>}
        {shown.length ? <div className="grid gap-3 lg:grid-cols-2">{shown.map((g) => card(g, { approve: canApprove, cancel: (g.status === "pending" || g.status === "approved"), wa: true }))}</div>
          : <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[12px] opacity-70">Nothing here.</div>}
      </div>);
  }

  // MY FLAT
  const mine = groups.filter((g) => g.flat_id === flatId).sort((a, b) => b.book_date.localeCompare(a.book_date));
  const toApprove = canApprove ? groups.filter((g) => g.status === "pending") : [];
  return (
    <div id="sec-booking" className="scroll-mt-28 border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 mt-4">
      <div className="mono text-[11px] font-bold tracking-[0.16em]">BOOK COMMON PLOT</div>
      <div className="mono text-[11px] opacity-60">{areas.map((a) => a.name).join(", ")} • full day • the Chairman or Secretary approves, then an invoice is raised</div>
      {toApprove.length > 0 && <>
        <div className="mt-3 mono text-[11px] font-bold tracking-[0.12em] text-red-700">REQUESTS TO APPROVE • {toApprove.length}</div>
        <div className="mt-2 grid gap-3">{toApprove.map((g) => card(g, { approve: true }))}</div>
      </>}
      {canCharge && <ChargesBox areas={areas} onDone={load} />}
      {flatId && <BookForm flatId={flatId} areas={areas} taken={taken} isCommittee={isCommittee} today={today} onDone={load} />}
      {err && <div className="mt-3 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[12px]">{err}</div>}
      {mine.length > 0 && <>
        <div className="mt-4 mono text-[11px] font-bold tracking-[0.12em]">MY BOOKINGS</div>
        <div className="mt-2 grid gap-3">{mine.slice(0, 15).map((g) => card(g, { cancel: memberCanCancel(g, today) }))}</div>
      </>}
    </div>);
}

function BookForm({ flatId, areas, taken, isCommittee, today, onDone }: { flatId: string; areas: Area[]; taken: Taken[]; isCommittee: boolean; today: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(addDays(today, 1)); const [freeEvent, setFreeEvent] = useState(false);
  const [pick, setPick] = useState<string[]>([]); const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState("");
  const free = areas.filter((a) => !takenBy(taken, a.id, date));
  useEffect(() => { setPick((p) => p.filter((id) => free.some((a) => a.id === id))); }, [date]);
  const total = totalFor(areas, pick, freeEvent);

  async function submit() {
    if (!date) { setErr("Choose the date."); return; }
    if (!pick.length) { setErr("Choose at least one area."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("request_booking", { p_flat: flatId, p_areas: pick, p_date: date, p_slot: "day", p_purpose: purpose, p_free: freeEvent });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(`Request sent for ${dayText(date)} (full day). You will see it here as CONFIRMED once the Chairman or Secretary approves${total > 0 ? `; an invoice of ${rupees(total)} is then raised in your name` : ""}.`);
    setOpen(false); setPick([]); setPurpose(""); onDone();
  }
  return (
    <div className="mt-3">
      {done && <div className="border border-emerald-300 bg-emerald-50 p-3 mono text-[12px] mb-3 text-emerald-800">✓ {done} <button onClick={() => setDone("")} className="underline ml-2">OK</button></div>}
      {!open ? <button onClick={() => setOpen(true)} className="btn-gold w-full sm:w-auto px-5 py-3 mono text-[12px] tracking-[0.08em]">+ BOOK AN AREA</button> : (
        <div className="border border-[var(--gold)] bg-[#fffdf5] p-3 space-y-3 mono text-[12px]">
          <label className="block"><span className="text-[11px] font-bold">DATE *</span>
            <input type="date" className="field mt-1" value={date} min={isCommittee ? undefined : addDays(today, 1)} max={isCommittee ? undefined : addDays(today, 90)} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="text-[11px] opacity-70">Booking is for the <b>full day</b>. One booking per area per date.</div>
          {isCommittee && <label className="flex items-center gap-3 border border-[var(--border)] bg-white p-3"><input type="checkbox" className="h-5 w-5" checked={freeEvent} onChange={(e) => setFreeEvent(e.target.checked)} />
            <span><b>Society event</b> • no charge, no invoice (the event collects through its own passes)</span></label>}
          <div><span className="text-[11px] font-bold">AREA *</span>
            <div className="mt-1 grid gap-2">
              {areas.map((a) => { const t = takenBy(taken, a.id, date); return (
                <label key={a.id} className={`flex items-center gap-3 border p-3 ${t ? "opacity-60 bg-gray-50" : pick.includes(a.id) ? "border-[var(--navy)] bg-white" : "border-[var(--border)] bg-white"}`}>
                  <input type="checkbox" className="h-5 w-5" disabled={!!t} checked={pick.includes(a.id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                  <span className="flex-1"><b>{a.name}</b>{a.description ? <span className="opacity-60"> • {a.description}</span> : null}</span>
                  {!t && <span className="text-[11px] font-bold shrink-0">{freeEvent || !(Number(a.charge) > 0) ? "no charge" : `${rupees(Number(a.charge))} / day`}</span>}
                  {t && <span className="text-[11px] text-red-700">{t.status === "approved" ? "booked" : "requested"} • {flatLabel(t.flat_id)}</span>}
                </label>); })}
              {free.length > 1 && <button type="button" onClick={() => setPick(free.map((a) => a.id))} className="btn-line py-2.5">SELECT ALL FREE AREAS</button>}
            </div></div>
          <label className="block"><span className="text-[11px] font-bold">PURPOSE (optional)</span>
            <input className="field mt-1" maxLength={200} placeholder="e.g. Birthday party, about 40 guests" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
          {pick.length > 0 && <div className="border border-[var(--navy)] bg-white p-3 text-[13px]">Total for {dayText(date)}: <b>{total > 0 ? rupees(total) : "no charge"}</b>{total > 0 && <span className="block text-[11px] opacity-70">An invoice for this amount is raised in your name when the Chairman or Secretary approves. No deposit.</span>}</div>}
          {pick.length === areas.length && areas.length > 1 && <div className="text-[11px] text-amber-800">All areas: the notice will ask everyone to park outside the premises.</div>}
          {err && <div className="text-red-700">{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="btn-navy flex-1 sm:flex-none px-5 py-3 font-bold">{busy ? "SENDING…" : "SEND REQUEST"}</button>
            <button onClick={() => { setOpen(false); setErr(""); }} className="btn-line px-4 py-3">CANCEL</button>
          </div>
        </div>)}
    </div>);
}

/** Charge per area per day: Chairman, Secretary or main admin (the database checks; this box is only shown to them). Every change is logged. */
function ChargesBox({ areas, onDone }: { areas: Area[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [hist, setHist] = useState<{ at: string; actor: string; target: string; details: string }[]>([]);
  useEffect(() => { if (open) supabase.from("access_log").select("at,actor,target,details").eq("action", "booking_charge_set").order("at", { ascending: false }).limit(15).then(({ data }) => setHist((data as any[]) || [])); }, [open, ok]);
  useEffect(() => { setVals(Object.fromEntries(areas.map((a) => [a.id, String(Number(a.charge) || 0)]))); }, [areas]);
  async function save() {
    setBusy(true); setErr(""); setOk("");
    for (const a of areas) {
      const n = Number(vals[a.id]);
      if (!(n >= 0) || !Number.isFinite(n)) { setErr(`Enter a charge for ${a.name} (0 for none).`); setBusy(false); return; }
      if (n === (Number(a.charge) || 0)) continue;
      const { error } = await supabase.rpc("set_booking_charge", { p_area: a.id, p_charge: n });
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    setBusy(false); setOk("Charges saved. Bookings already made keep the charge they were made with."); onDone();
  }
  return (
    <div className="mt-3 border border-[var(--border)] bg-white mono text-[12px]">
      <button onClick={() => setOpen(!open)} className="w-full text-left p-3 min-h-[44px] font-bold flex justify-between"><span>BOOKING CHARGES (per area, per day)</span><span>{open ? "▲" : "▼"}</span></button>
      {open && <div className="p-3 pt-0 space-y-2">
        {areas.map((a) => (
          <label key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] pb-2">
            <span className="basis-full sm:basis-56 sm:flex-none min-w-0 font-bold">{a.name}</span>
            <span className="flex items-center gap-1.5"><span>₹</span>
              <input inputMode="decimal" className="field !w-36" value={vals[a.id] ?? ""} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value.replace(/[^0-9.]/g, "") })} /><span className="opacity-60">per day</span></span></label>))}
        {err && <div className="text-red-700">{err}</div>}{ok && <div className="text-emerald-700">✓ {ok}</div>}
        <button onClick={save} disabled={busy} className="btn-navy px-5 min-h-[44px] font-bold">{busy ? "SAVING…" : "SAVE CHARGES"}</button>
        {hist.length > 0 && <div className="pt-2 border-t border-[var(--border)]"><div className="font-bold text-[11px] mb-1">CHANGES</div>
          {hist.map((h, i) => <div key={i} className="text-[11px] opacity-80">{new Date(h.at).toLocaleDateString("en-IN")} • {h.target} • {h.details} • {h.actor}</div>)}</div>}
      </div>}
    </div>);
}
