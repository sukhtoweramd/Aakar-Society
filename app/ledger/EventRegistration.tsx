"use client";
// EVENTS → event → REGISTRATION
//   Convenor / committee: meals (sessions), prices, last date, open or close registration.
//   Every flat: register the numbers (regular / Jain, members / guests), pay by UPI screenshot or cash, then see the passes.
//   Event team: totals for the caterer, payments to confirm, flat-wise list; convenor / treasurer can enter for a flat.
import { useEffect, useMemo, useState } from "react";
import { label, ownerText, sortFlats, isOccupied, type Flat } from "@/lib/society";
import { inr, openPrint } from "@/lib/billing";
import type { EventRole, TeamRow } from "@/lib/events";
import { pictureText, readPaymentScreenshot, toJpeg } from "@/lib/readPayment";
import { openProof, uploadProof } from "@/lib/payReports";
import {
  ZERO, amountFor, countText, countsPages, deadlineText, isOpen, loadRegs, newSessionId, passCode, passImage, passReady, people, peopleInFlat,
  priceText, qrPath, register, saveSettings, sessionTotals, sessionWhen, sessionsOf, submitPayment, verifyPayment,
  type Count, type Counts, type Reg, type RegSettings, type Session,
} from "@/lib/eventReg";
import { teamName } from "./EventTeam";

type Ev = { id: string; title: string | null } & RegSettings;
type Props = { ev: Ev; flats: Flat[]; team: TeamRow[]; isCommittee: boolean; myRole: EventRole | null; homeFlat: string | null; onSettings: () => void };

const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const toLocalInput = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const flatName = (flats: Flat[], id: string | null) => { const f = flats.find((x) => x.id === id); return f ? label(f) : id || ""; };

export default function EventRegistration(p: Props) {
  const { ev, flats, team, isCommittee, myRole, homeFlat } = p;
  const sessions = sessionsOf(ev);
  const keeper = isCommittee || myRole === "Convenor" || myRole === "Treasurer";
  const canSetup = isCommittee || myRole === "Convenor";
  const teamView = isCommittee || !!myRole;
  const [regs, setRegs] = useState<Reg[] | null | undefined>(undefined);
  const [forFlat, setForFlat] = useState("");
  const reload = () => loadRegs(ev.id).then(setRegs);
  useEffect(() => { reload(); }, [ev.id]);

  if (regs === undefined) return <div className="mono text-[11px] opacity-60">Loading…</div>;
  if (regs === null) return <div className="border border-amber-200 bg-amber-50 text-amber-800 p-3 mono text-[11px]">Event registration is not set up yet. The main admin needs to run <b>EVENT_REGISTRATION.sql</b> once in Supabase.</div>;
  const mine = homeFlat ? regs.find((r) => r.flat_id === homeFlat) || null : null;

  return (
    <div className="space-y-4">
      {canSetup && <Setup ev={ev} onSaved={p.onSettings} />}
      {!sessions.length && !canSetup && <div className="mono text-[11px] opacity-60">The event team has not opened registration yet.</div>}
      {sessions.length > 0 && homeFlat && <FlatRegistration ev={ev} flat={homeFlat} reg={mine} flats={flats} team={team} keeperMode={false} keeper={keeper} onChanged={reload} />}
      {sessions.length > 0 && teamView && <TeamView ev={ev} regs={regs} flats={flats} team={team} keeper={keeper} homeFlat={homeFlat} onChanged={reload} />}
      {sessions.length > 0 && keeper && (
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <label className="block mono text-[10px] tracking-[0.12em] opacity-80">ENTER OR CHANGE FOR A FLAT (e.g. collected at the door)
            <select className="field mt-1" value={forFlat} onChange={(e) => setForFlat(e.target.value)}>
              <option value="">Choose flat…</option>
              {[...flats].sort(sortFlats).map((f) => <option key={f.id} value={f.id}>{label(f)} • {ownerText(f)}{regs.some((r) => r.flat_id === f.id) ? " ✓" : ""}</option>)}
            </select></label>
          {forFlat && <FlatRegistration key={forFlat} ev={ev} flat={forFlat} reg={regs.find((r) => r.flat_id === forFlat) || null} flats={flats} team={team} keeperMode keeper onChanged={reload} />}
        </div>
      )}
    </div>
  );
}

// ---------------- settings (convenor / committee) ----------------
function Setup({ ev, onSaved }: { ev: Ev; onSaved: () => void }) {
  const [open, setOpen] = useState(!sessionsOf(ev).length);
  const [list, setList] = useState<Session[]>(sessionsOf(ev).length ? sessionsOf(ev) : [{ id: newSessionId(), name: "", date: null, member_price: 0, guest_price: null, ask_jain: true }]);
  const [regOpen, setRegOpen] = useState(!!ev.reg_open);
  const [deadline, setDeadline] = useState(toLocalInput(ev.reg_deadline));
  const [upi, setUpi] = useState(ev.reg_upi || "");
  const [prefill, setPrefill] = useState(ev.reg_prefill !== false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const upd = (i: number, k: Partial<Session>) => setList((l) => l.map((s, j) => (j === i ? { ...s, ...k } : s)));
  async function save() {
    setErr(""); setMsg("");
    const clean = list.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim(), member_price: Number(s.member_price || 0), guest_price: s.guest_price == null ? null : Number(s.guest_price || 0) }));
    if (regOpen && !clean.length) { setErr("Add at least one meal / session before opening registration."); return; }
    setBusy(true);
    try { await saveSettings(ev.id, { sessions: clean, open: regOpen, deadline: deadline ? new Date(deadline).toISOString() : null, upi, prefill }); setMsg(regOpen ? "Saved. Registration is open to members." : "Saved. Registration is closed to members."); onSaved(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="border border-[var(--gold)] bg-[#fffdf5]">
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center gap-2 p-3 text-left mono text-[11px]">
        <span className="font-bold tracking-[0.12em]">REGISTRATION SETTINGS {ev.reg_open ? <span className="ml-1 bg-emerald-600 text-white px-1.5 py-0.5 text-[9px]">OPEN</span> : <span className="ml-1 border border-[var(--border)] px-1.5 py-0.5 text-[9px]">CLOSED</span>}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="p-3 pt-0 space-y-3 mono text-[11px]">
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block opacity-80">LAST DATE &amp; TIME TO REGISTER<input type="datetime-local" className="field mt-1" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label className="block opacity-80">PAY TO (event UPI ID or account)<input className="field mt-1" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="e.g. name@okhdfc" /></label>
        </div>
        <div className="font-bold tracking-[0.12em] text-[var(--gold-dark,#8a6d1e)]">MEALS / SESSIONS</div>
        {list.map((s, i) => (
          <div key={s.id} className="border border-[var(--border)] bg-white p-3 space-y-2">
            <div className="flex gap-2 items-end">
              <label className="flex-1 opacity-80">NAME<input className="field mt-1" value={s.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="e.g. Dinner • 8 pm" /></label>
              <label className="w-[150px] opacity-80">DATE<input type="date" className="field mt-1" value={s.date || ""} onChange={(e) => upd(i, { date: e.target.value || null })} /></label>
              <button onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="Remove session" className="h-[38px] w-[38px] border border-[var(--border)] text-red-600 text-[16px]">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="opacity-80">MEMBER PRICE ₹ (0 = free)<input type="number" min={0} className="field mt-1" value={s.member_price ?? 0} onChange={(e) => upd(i, { member_price: Number(e.target.value) })} /></label>
              <label className="opacity-80">GUEST PRICE ₹<input type="number" min={0} className="field mt-1" disabled={s.guest_price == null} value={s.guest_price ?? ""} onChange={(e) => upd(i, { guest_price: Number(e.target.value) })} placeholder="guests not allowed" /></label>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.guest_price != null} onChange={(e) => upd(i, { guest_price: e.target.checked ? 0 : null })} /> Guests allowed</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.ask_jain} onChange={(e) => upd(i, { ask_jain: e.target.checked })} /> Ask for Jain count</label>
            </div>
          </div>
        ))}
        <button onClick={() => setList((l) => [...l, { id: newSessionId(), name: "", date: null, member_price: 0, guest_price: null, ask_jain: true }])} className="w-full border border-dashed border-[var(--gold)] py-2.5 font-bold tracking-[0.08em]">+ ADD MEAL / SESSION</button>
        <label className="flex items-start gap-2"><input type="checkbox" checked={prefill} onChange={(e) => setPrefill(e.target.checked)} className="mt-0.5" /> Start each flat with the number of people living there</label>
        <label className="flex items-start gap-2 font-bold"><input type="checkbox" checked={regOpen} onChange={(e) => setRegOpen(e.target.checked)} className="mt-0.5" /> Registration open to members</label>
        {err && <div className="text-red-700">{err}</div>}{msg && <div className="text-emerald-700">✓ {msg}</div>}
        <button onClick={save} disabled={busy} className="btn-navy w-full sm:w-auto px-6 py-3 tracking-[0.1em]">{busy ? "SAVING…" : "SAVE SETTINGS"}</button>
      </div>}
    </div>
  );
}

// ---------------- one flat: numbers, payment, passes ----------------
function Counter({ label: l, value, onChange, disabled }: { label: React.ReactNode; value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 text-[14px]">{l}</div>
      <button type="button" disabled={disabled || value <= 0} onClick={() => onChange(value - 1)} aria-label="Less" className="h-11 w-11 border border-[var(--border)] bg-white text-[20px] font-bold disabled:opacity-30">−</button>
      <div className="w-8 text-center text-[16px] font-bold">{value}</div>
      <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} aria-label="More" className="h-11 w-11 border border-[var(--border)] bg-white text-[20px] font-bold disabled:opacity-30">+</button>
    </div>
  );
}

function FlatRegistration({ ev, flat, reg, flats, team, keeperMode, keeper, onChanged }: { ev: Ev; flat: string; reg: Reg | null; flats: Flat[]; team: TeamRow[]; keeperMode: boolean; keeper: boolean; onChanged: () => void }) {
  const sessions = sessionsOf(ev);
  const [counts, setCounts] = useState<Counts | null>(reg ? reg.counts : null);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    if (reg) { setCounts(reg.counts); return; }
    (async () => {
      const n = ev.reg_prefill === false ? 0 : await peopleInFlat(flat, keeper).catch(() => 0);
      setCounts(Object.fromEntries(sessions.map((s) => [s.id, { ...ZERO, mr: n }])));
    })();
  }, [reg?.id, reg?.updated_at, flat]);
  const open = isOpen(ev);
  const paidOrSent = reg && (reg.pay_status === "submitted" || reg.pay_status === "verified");
  const canEdit = keeperMode || (open && !paidOrSent);
  const editing = !reg || changing;
  const total = counts ? amountFor(sessions, counts) : 0;
  const set = (sid: string, k: keyof Count, n: number) => setCounts((c) => ({ ...(c || {}), [sid]: { ...ZERO, ...(c?.[sid] || {}), [k]: Math.max(0, Math.min(60, n)) } }));

  async function send() {
    if (!counts) return;
    setBusy("reg"); setErr(""); setMsg("");
    try {
      const r = await register(ev.id, keeperMode || keeper ? flat : null, counts);
      setChanging(false); setMsg(r ? "Registration saved." : "Registration cancelled."); onChanged();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  if (!counts) return <div className="mono text-[11px] opacity-60">Loading…</div>;
  return (
    <div className={`border ${keeperMode ? "border-[var(--border)]" : "border-[var(--navy)]"} bg-[var(--surface)] overflow-hidden`}>
      {!keeperMode && <div className="bg-[var(--navy)] text-white px-4 py-3">
        <div className="mono text-[10px] tracking-[0.18em] text-[var(--gold)] font-bold">{open ? "REGISTRATION OPEN" : "REGISTRATION CLOSED"} • FLAT {flatName(flats, flat)}</div>
        {ev.reg_deadline && <div className="text-[12px] opacity-85 mt-1">{open ? "Register or change by" : "Last date was"} <b>{deadlineText(ev.reg_deadline)}</b></div>}
      </div>}

      <div className="p-4 space-y-3">
        {!editing && reg && (
          <div className="space-y-2">
            <div className="mono text-[10px] tracking-[0.14em] opacity-70">YOUR REGISTRATION</div>
            {sessions.filter((s) => people(reg.counts?.[s.id])).map((s) => <div key={s.id} className="flex justify-between gap-2 text-[14px] border-b border-[var(--border)] pb-1.5"><b>{s.name}</b><span className="text-right">{countText(reg.counts[s.id])}</span></div>)}
            <div className="flex justify-between items-center pt-1"><span className="mono text-[11px]">{Number(reg.amount) > 0 ? "AMOUNT" : ""}</span><span className="serif text-[20px] font-bold">{Number(reg.amount) > 0 ? `₹${inr(reg.amount)}` : "Free"}</span></div>
            {canEdit && <button onClick={() => setChanging(true)} className="btn-line w-full py-2.5 mono text-[11px] tracking-[0.08em]">CHANGE NUMBERS</button>}
          </div>
        )}

        {editing && (canEdit ? <>
          {!reg && !keeperMode && <div className="text-[12px] opacity-75">{ev.reg_prefill === false ? "Enter how many will come." : "Filled in with the people in your flat. Change the numbers if needed."}</div>}
          {sessions.map((s) => {
            const c = counts[s.id] || ZERO;
            return (
              <div key={s.id} className="border border-[var(--border)] bg-white p-3 space-y-2.5">
                <div className="flex flex-wrap justify-between items-baseline gap-x-2">
                  <div className="serif text-[17px] font-bold">{s.name}</div>
                  <div className="mono text-[10px] opacity-70">{[sessionWhen(s), priceText(s)].filter(Boolean).join(" • ")}</div>
                </div>
                <Counter label={s.ask_jain ? "Members • Regular" : "Members"} value={c.mr} onChange={(n) => set(s.id, "mr", n)} disabled={!!busy} />
                {s.ask_jain && <Counter label={<>Members • <b className="text-[#8a6d1e]">Jain</b></>} value={c.mj} onChange={(n) => set(s.id, "mj", n)} disabled={!!busy} />}
                {s.guest_price != null && <>
                  <div className="h-px bg-[var(--border)]" />
                  <Counter label={s.ask_jain ? "Guests • Regular" : "Guests"} value={c.gr} onChange={(n) => set(s.id, "gr", n)} disabled={!!busy} />
                  {s.ask_jain && <Counter label={<>Guests • <b className="text-[#8a6d1e]">Jain</b></>} value={c.gj} onChange={(n) => set(s.id, "gj", n)} disabled={!!busy} />}
                </>}
              </div>
            );
          })}
          <div className="bg-[var(--navy)] text-white p-3 flex justify-between items-center gap-3">
            <div className="text-[11px] opacity-85">{sessions.filter((s) => people(counts[s.id])).map((s) => `${s.name}: ${people(counts[s.id])}`).join(" • ") || "Nobody selected"}</div>
            <div className="text-right"><div className="mono text-[9px] tracking-[0.14em] text-[var(--gold)]">TO PAY</div><div className="serif text-[22px] font-bold">{total ? `₹${inr(total)}` : "Free"}</div></div>
          </div>
          <div className="flex gap-2">
            <button onClick={send} disabled={!!busy} className="btn-gold flex-1 py-3.5 font-bold tracking-[0.08em] text-[14px]">{busy === "reg" ? "SAVING…" : reg ? "SAVE CHANGES" : "SEND REGISTRATION"}</button>
            {changing && <button onClick={() => { setChanging(false); setCounts(reg!.counts); }} className="btn-line px-4">CANCEL</button>}
          </div>
          {reg && <div className="mono text-[10px] opacity-60">Set all numbers to 0 and save to cancel the registration.</div>}
        </> : <div className="mono text-[11px] opacity-70">Registration is closed. Please contact the event team.</div>)}

        {err && <div className="border border-red-200 bg-red-50 text-red-700 p-2 mono text-[11px]">{err}</div>}
        {msg && <div className="text-emerald-700 mono text-[11px]">✓ {msg}</div>}

        {reg && !editing && Number(reg.amount) > 0 && <Payment ev={ev} reg={reg} flats={flats} team={team} keeperMode={keeperMode} onChanged={onChanged} />}
        {reg && !editing && passReady(reg) && <Passes ev={ev} reg={reg} flats={flats} />}
      </div>
    </div>
  );
}

function Payment({ ev, reg, flats, team, keeperMode, onChanged }: { ev: Ev; reg: Reg; flats: Flat[]; team: TeamRow[]; keeperMode: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<"UPI" | "Cash">(keeperMode ? "Cash" : "UPI");
  const [f, setF] = useState({ amount: String(reg.amount), date: istToday(), ref: "", bank: "", cashTo: "" });
  const [file, setFile] = useState<File | null>(null); const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [note, setNote] = useState("");
  const teamList = [...team].sort((a, b) => ({ Convenor: 0, Treasurer: 1, Member: 2 }[a.role] - { Convenor: 0, Treasurer: 1, Member: 2 }[b.role]));
  if (reg.pay_status === "verified") {
    const balance = Number(reg.amount) - Number(reg.pay_amount || 0);
    return <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-[13px]">✓ <b>Paid ₹{inr(reg.pay_amount)}</b> ({reg.pay_mode}) — confirmed.{balance > 0.001 && <div className="mt-1 text-amber-800">Numbers were increased later: ₹{inr(balance)} more to pay to the event team.</div>}</div>;
  }
  if (reg.pay_status === "submitted") {
    const who = reg.pay_mode === "Cash" ? teamList.find((t) => t.flat_id === reg.cash_to) : null;
    return <div className="border border-[var(--gold)] bg-[#fffbea] p-3 text-[13px]">⏳ <b>₹{inr(reg.pay_amount)} {reg.pay_mode === "Cash" ? `cash paid to ${who ? teamName(flats, who) : "the event team"}` : "paid by UPI"}</b> on {reg.pay_date ? new Date(reg.pay_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}. Waiting for the event team to confirm. Your passes appear here once confirmed.</div>;
  }

  async function pick(raw: File | null) {
    if (!raw) return;
    setErr(""); setNote("Reading your screenshot…");
    const img = await toJpeg(raw, 1280); setFile(img);
    setThumb(pictureText(img) || URL.createObjectURL(img));
    const r = await readPaymentScreenshot(img);
    const g = r.fields;
    setF((x) => ({ ...x, amount: g.amount || x.amount, date: g.paid_on || x.date, ref: g.ref || x.ref, bank: g.bank || x.bank }));
    setNote(r.error ? `${r.error}` : Object.keys(g).length ? "Filled from your screenshot. Please check." : r.warnings[0] || "");
  }
  async function send() {
    setErr("");
    const amt = Number(f.amount);
    if (!(amt > 0)) { setErr("Enter the amount paid."); return; }
    if (mode === "UPI" && !f.ref.trim() && !file) { setErr("Upload the payment screenshot or type the UTR / UPI reference."); return; }
    if (mode === "Cash" && !f.cashTo) { setErr("Choose who you gave the cash to."); return; }
    setBusy("pay");
    try {
      const proof = mode === "UPI" && file ? await uploadProof(file, reg.flat_id) : null;
      await submitPayment(reg.id, { mode, amount: amt, date: f.date, ref: f.ref, bank: f.bank, proof, cashTo: mode === "Cash" ? f.cashTo : null });
      onChanged();
    } catch (e: any) { setErr(e?.name === "TimeoutError" ? "Sending took too long. Please try again." : e.message); }
    setBusy("");
  }
  const inp = "field mt-1 !text-[15px]";
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-3">
      {reg.pay_status === "rejected" && <div className="border border-red-200 bg-red-50 text-red-700 p-2 text-[12px]">The event team could not confirm your last payment: <b>{reg.reject_reason}</b>. Please check and send again.</div>}
      <div className="mono text-[10px] tracking-[0.16em] font-bold text-[#8a6d1e]">HOW DID YOU PAY ₹{inr(reg.amount)}?</div>
      <div className="grid grid-cols-2 border border-[var(--navy)]">
        {(["UPI", "Cash"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`py-3 font-bold text-[13px] ${mode === m ? "bg-[var(--navy)] text-white" : "bg-white"}`}>{m === "UPI" ? "UPI / BANK" : "CASH"}</button>)}
      </div>
      {mode === "UPI" ? <>
        {ev.reg_upi && <div className="bg-white border border-[var(--border)] p-3 text-[13px]">Pay to <b className="select-all">{ev.reg_upi}</b><div className="text-[11px] opacity-70 mt-1">Remark: <b>{flatName(flats, reg.flat_id)} {ev.title}</b></div></div>}
        <label className="block border-2 border-dashed border-[var(--gold)] bg-white p-4 text-center cursor-pointer">
          {thumb ? <img src={thumb} alt="Payment screenshot" className="h-28 mx-auto border border-[var(--border)]" /> : <div className="font-bold text-[14px]">I HAVE PAID • UPLOAD SCREENSHOT</div>}
          <div className="text-[11px] opacity-70 mt-1">{thumb ? "Tap to use another screenshot" : "Amount, date and UTR are filled in from it"}</div>
          <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0] || null); e.target.value = ""; }} />
        </label>
        {note && <div className="mono text-[11px] text-[#8a6d1e]">{note}</div>}
        <div className="grid grid-cols-2 gap-2 mono text-[10px]">
          <label className="opacity-80">AMOUNT ₹<input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label className="opacity-80">DATE<input type="date" max={istToday()} className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="opacity-80 col-span-2">UTR / UPI REF.<input className={inp} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></label>
        </div>
      </> : <>
        <div className="mono text-[10px] tracking-[0.12em] opacity-80">{keeperMode ? "CASH RECEIVED BY" : "I GAVE THE CASH TO"}</div>
        <div className="space-y-1.5">
          {teamList.map((t) => (
            <label key={t.id} className={`flex items-center gap-3 p-3 min-h-[48px] border bg-white text-[14px] cursor-pointer ${f.cashTo === t.flat_id ? "border-2 border-[var(--gold)] bg-[#fffbea]" : "border-[var(--border)]"}`}>
              <input type="radio" name={`cash-${reg.id}`} checked={f.cashTo === t.flat_id} onChange={() => setF({ ...f, cashTo: t.flat_id })} />
              <span className="flex-1">{teamName(flats, t)} <span className="opacity-60 text-[12px]">• {flatName(flats, t.flat_id)}</span></span><span className="mono text-[10px] opacity-60">{t.role}</span>
            </label>
          ))}
          {!teamList.length && <div className="mono text-[11px] opacity-60">The event team is not set up yet.</div>}
        </div>
        <div className="grid grid-cols-2 gap-2 mono text-[10px]">
          <label className="opacity-80">AMOUNT ₹<input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label className="opacity-80">DATE<input type="date" max={istToday()} className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        </div>
        {!keeperMode && <div className="text-[11px] opacity-70">They will be asked in the app to confirm they received it.</div>}
      </>}
      {err && <div className="border border-red-200 bg-red-50 text-red-700 p-2 mono text-[11px]">{err}</div>}
      <button onClick={send} disabled={!!busy} className="btn-navy w-full py-3.5 font-bold tracking-[0.08em] text-[14px]">{busy ? "SENDING…" : mode === "UPI" ? "SEND TO EVENT TREASURER" : "SEND"}</button>
    </div>
  );
}

function Passes({ ev, reg, flats }: { ev: Ev; reg: Reg; flats: Flat[] }) {
  const list = sessionsOf(ev).filter((s) => people(reg.counts?.[s.id]));
  const flat = flatName(flats, reg.flat_id);
  async function share(s: Session) {
    const file = passImage({ event: ev.title || "Event", session: s.name, when: sessionWhen(s), flat, counts: countText(reg.counts[s.id]), code: passCode(reg, s) });
    const nav: any = navigator;
    try {
      if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: `${ev.title} pass`, text: `${ev.title} • ${s.name} • ${flat}` }); return; }
    } catch (e: any) { if (e?.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-3">
      <div className="mono text-[10px] tracking-[0.16em] font-bold text-[#8a6d1e]">YOUR PASSES • {list.length}</div>
      {list.map((s) => {
        const q = qrPath(passCode(reg, s));
        return (
          <div key={s.id} className="bg-[var(--navy)] text-white border-[3px] border-[var(--gold)] p-4 text-center">
            <div className="mono text-[9px] tracking-[0.18em] text-[var(--gold)]">EVENT PASS • {ev.title}</div>
            <div className="mt-2 bg-[var(--gold)] text-[var(--navy)] font-bold py-1.5 text-[15px]">{s.name}{sessionWhen(s) ? ` • ${sessionWhen(s)}` : ""}</div>
            <svg viewBox={`-4 -4 ${q.size + 8} ${q.size + 8}`} className="mx-auto mt-3 w-[190px] h-[190px] bg-white" role="img" aria-label={`QR code for ${flat} ${s.name}`}><path d={q.d} fill="#000" /></svg>
            <div className="serif text-[30px] font-bold mt-2">{flat}</div>
            <div className="text-[14px] text-[#f3dfa0]">{countText(reg.counts[s.id])}</div>
            <button onClick={() => share(s)} className="mt-3 w-full bg-white text-[var(--navy)] font-bold py-3 text-[13px] tracking-[0.06em]">SHARE PASS (WhatsApp)</button>
          </div>
        );
      })}
      <div className="text-[11px] opacity-70">Show this pass at the counter. Family members coming at different times can share the same pass.</div>
    </div>
  );
}

// ---------------- event team: totals, payments to confirm, flats ----------------
function TeamView({ ev, regs, flats, team, keeper, homeFlat, onChanged }: { ev: Ev; regs: Reg[]; flats: Flat[]; team: TeamRow[]; keeper: boolean; homeFlat: string | null; onChanged: () => void }) {
  const sessions = sessionsOf(ev);
  const tot = useMemo(() => sessionTotals(sessions, regs), [regs, ev.pass_sessions]);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const toCheck = regs.filter((r) => r.pay_status === "submitted" && (keeper || (r.pay_mode === "Cash" && !!homeFlat && r.cash_to === homeFlat)));
  const paid = regs.filter((r) => r.pay_status === "verified").reduce((n, r) => n + Number(r.pay_amount || 0), 0);
  const unpaid = regs.filter((r) => Number(r.amount) > 0 && r.pay_status !== "verified");
  const occupied = flats.filter(isOccupied).length || flats.length;
  const who = (id: string | null) => { const t = team.find((x) => x.flat_id === id); return t ? teamName(flats, t) : flatName(flats, id); };
  const cashBy = Object.entries(regs.filter((r) => r.pay_status === "verified" && r.pay_mode === "Cash").reduce((m: Record<string, number>, r) => { const k = r.cash_to || "?"; m[k] = (m[k] || 0) + Number(r.pay_amount || 0); return m; }, {}));
  async function decide(r: Reg, ok: boolean) {
    let reason = "";
    if (!ok) { reason = prompt(`Why can't you confirm ₹${inr(r.pay_amount)} from ${flatName(flats, r.flat_id)}? (the flat will see this)`) || ""; if (!reason.trim()) return; }
    else if (!confirm(`Confirm ₹${inr(r.pay_amount)} ${r.pay_mode === "Cash" ? "cash" : "UPI"} from ${flatName(flats, r.flat_id)}?\n\nIt will be added to the event accounts and the flat gets its passes.`)) return;
    setBusy(r.id); setErr("");
    try { await verifyPayment(r.id, ok, reason); onChanged(); } catch (e: any) { setErr(e.message); }
    setBusy("");
  }
  const status = (r: Reg) => passReady(r) ? <span className="mono text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5">{Number(r.amount) ? "PAID" : "FREE"}</span>
    : r.pay_status === "submitted" ? <span className="mono text-[9px] font-bold bg-[#fdf3d3] px-1.5 py-0.5">TO CHECK</span>
    : <span className="mono text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5">UNPAID</span>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="mono text-[10px] tracking-[0.16em] font-bold">EVENT TEAM • {regs.length} OF {occupied} FLATS REGISTERED</div>
        <button onClick={() => openPrint(`${ev.title} – counts`, countsPages(ev.title || "Event", sessions, regs, flats))} className="btn-navy mono text-[11px] px-3 py-2">CATERER COUNT (PDF)</button>
      </div>
      <div className="overflow-x-auto border border-[var(--border)] bg-white">
        <table className="w-full mono text-[11px]">
          <thead><tr className="bg-[var(--navy)] text-white"><th className="text-left px-3 py-2">MEAL</th><th className="text-right px-2">REGULAR</th><th className="text-right px-2">JAIN</th><th className="text-right px-3">TOTAL</th></tr></thead>
          <tbody>{tot.map(({ s, t }) => <tr key={s.id} className="border-t border-[var(--border)]"><td className="px-3 py-2"><b>{s.name}</b><div className="opacity-60">members {t.mr + t.mj} • guests {t.gr + t.gj}</div></td><td className="text-right px-2">{t.mr + t.gr}</td><td className="text-right px-2">{t.mj + t.gj}</td><td className="text-right px-3 font-bold">{people(t)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-2 mono text-[11px]">
        <div className="border border-[var(--border)] bg-white p-3"><div className="text-[9px] tracking-[0.12em] text-emerald-800 font-bold">PAID • {regs.filter((r) => r.pay_status === "verified").length} FLATS</div><div className="serif text-[18px] font-bold">₹{inr(paid)}</div></div>
        <div className="border border-[var(--border)] bg-white p-3"><div className="text-[9px] tracking-[0.12em] text-amber-800 font-bold">NOT YET CONFIRMED • {unpaid.length}</div><div className="serif text-[18px] font-bold">₹{inr(unpaid.reduce((n, r) => n + Number(r.amount), 0))}</div></div>
      </div>
      {cashBy.length > 0 && keeper && <div className="mono text-[11px] border border-[var(--border)] bg-white p-3"><b>CASH WITH TEAM MEMBERS:</b> {cashBy.map(([k, v]) => `${who(k)} ₹${inr(v)}`).join(" • ")}</div>}
      {err && <div className="border border-red-200 bg-red-50 text-red-700 p-2 mono text-[11px]">{err}</div>}
      {toCheck.length > 0 && <div className="border-2 border-[var(--gold)] bg-[#fffbea] p-3 space-y-2">
        <div className="mono text-[10px] tracking-[0.16em] font-bold">PAYMENTS TO CONFIRM • {toCheck.length}</div>
        {toCheck.map((r) => (
          <div key={r.id} className="bg-white border border-[var(--border)] p-3 text-[13px] space-y-1">
            <div className="flex justify-between gap-2"><b>{flatName(flats, r.flat_id)}</b><b>₹{inr(r.pay_amount)}{Number(r.pay_amount) !== Number(r.amount) && <span className="text-amber-700 font-normal text-[11px]"> (due ₹{inr(r.amount)})</span>}</b></div>
            <div className="text-[12px] opacity-80">{r.pay_mode === "Cash" ? `Cash to ${who(r.cash_to)}` : `UPI${r.pay_ref ? ` • ${r.pay_ref}` : ""}${r.pay_bank ? ` • ${r.pay_bank}` : ""}`} • {r.pay_date ? new Date(r.pay_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""} • {countText(Object.values(r.counts || {}).reduce((a, c) => ({ mr: a.mr + c.mr, mj: a.mj + c.mj, gr: a.gr + c.gr, gj: a.gj + c.gj }), { ...ZERO }))}</div>
            {r.proof_key && <button onClick={() => openProof(r.id, "ev")} className="underline text-[12px]">📎 view screenshot</button>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => decide(r, true)} disabled={busy === r.id} className="btn-navy flex-1 py-2.5 text-[12px] font-bold">{busy === r.id ? "…" : r.pay_mode === "Cash" ? "✓ YES, RECEIVED" : "✓ CONFIRM"}</button>
              <button onClick={() => decide(r, false)} disabled={busy === r.id} className="btn-line px-3 text-red-700 text-[12px]">REJECT</button>
            </div>
          </div>
        ))}
      </div>}
      <div className="border border-[var(--border)] bg-white">
        {[...regs].sort((a, b) => a.flat_id.localeCompare(b.flat_id)).map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] last:border-0 text-[12px]">
            <b className="w-[54px]">{flatName(flats, r.flat_id)}</b>
            <span className="flex-1 opacity-75">{sessions.filter((s) => people(r.counts?.[s.id])).map((s) => `${s.name} ${people(r.counts[s.id])}`).join(" • ")}</span>
            {Number(r.amount) > 0 && <span className="mono text-[11px]">₹{inr(r.amount)}</span>}{status(r)}
          </div>
        ))}
        {!regs.length && <div className="p-3 mono text-[11px] opacity-60">No registrations yet.</div>}
      </div>
    </div>
  );
}
