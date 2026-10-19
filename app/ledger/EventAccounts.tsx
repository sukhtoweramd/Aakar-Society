"use client";
// EVENTS → event → ACCOUNTS: the event's own money book (member fund, sponsorships, passes, expenses).
// Kept separate from society billing. Convenor / treasurer (or committee) record entries.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dmy, inr, openPrint, today } from "@/lib/billing";
import { uploadFile } from "@/lib/ledgerClient";
import { isOccupied, label, ownerText, residentName, sortFlats, type EventRow, type Flat } from "@/lib/society";
import EventBatch from "./EventBatch";
import { food, EV_MODES, IN_CATS, OUT_CATS, eventStatementHtml, fundListHtml, loadMoney, particulars, partyOf, passListHtml, totals, type EventMoneySettings, type EventRole, type Money, type TeamRow } from "@/lib/events";

type Ev = EventRow & Partial<EventMoneySettings>;
type Form = { id?: string; direction: "in" | "out"; entry_date: string; category: string; flat_id: string; party: string; purpose: string; qty: string; rate: string; amount: string; mode: Money["mode"]; reference: string; note: string; file_url: string; pass_type: "Member" | "Guest"; jain: string };
const VIEWS = ["ENTRIES", "MEMBER FUND", "SPONSORS", "PASSES"] as const;
const PURPOSE_HINT: Record<string, string> = { Sponsorship: "e.g. Day 3 dinner / Garba prizes", Passes: "e.g. Day 5 only", Food: "e.g. Day 1 dinner – caterer", Prizes: "e.g. Best dressed (from fund)" };

export default function EventAccounts({ ev, flats, team, isCommittee, myRole, email, onSettings }: { ev: Ev; flats: Flat[]; team: TeamRow[]; isCommittee: boolean; myRole: EventRole | null; email: string; onSettings: () => void }) {
  const canWrite = isCommittee || myRole === "Convenor" || myRole === "Treasurer";
  const canSettings = isCommittee || myRole === "Convenor";
  const seesAll = isCommittee || !!myRole || !!ev.accounts_public;
  const [list, setList] = useState<Money[] | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]>("ENTRIES");
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [set, setSet] = useState({ fund: ev.fund_per_flat != null ? String(ev.fund_per_flat) : "", pass: ev.pass_price != null ? String(ev.pass_price) : "", guest: ev.guest_pass_price != null ? String(ev.guest_pass_price) : "", pub: !!ev.accounts_public });
  const [fundF, setFundF] = useState<"ALL" | "PAID" | "NOT PAID">("ALL");
  const [dirF, setDirF] = useState<"ALL" | "in" | "out">("ALL");
  const [batch, setBatch] = useState<"fund" | "passes" | null>(null);
  const [msg, setMsg] = useState("");
  const [people, setPeople] = useState<Record<string, number>>({});
  useEffect(() => { if (canWrite) supabase.rpc("flat_people_counts").then(({ data }) => { const r: Record<string, number> = {}; ((data as any[]) || []).forEach((x) => { r[x.flat_id] = x.people; }); setPeople(r); }); }, [canWrite]);
  const priceOf = (t: "Member" | "Guest") => (t === "Guest" ? ev.guest_pass_price : ev.pass_price) ?? null;

  async function load() { try { setList(await loadMoney(ev.id)); } catch (e: any) { setError(e.message); setList([]); } }
  useEffect(() => { load(); }, [ev.id]);
  const t = useMemo(() => totals(list || []), [list]);
  const occupied = useMemo(() => [...flats].sort(sortFlats), [flats]); // all flats; not-occupied ones are marked
  const paid = useMemo(() => { const r: Record<string, number> = {}; (list || []).filter((m) => m.category === "Member fund" && m.flat_id).forEach((m) => { r[m.flat_id!] = (r[m.flat_id!] || 0) + Number(m.amount); }); return r; }, [list]);

  const blank = (direction: "in" | "out", over: Partial<Form> = {}): Form => ({ direction, entry_date: today(), category: direction === "in" ? "Member fund" : "Food", flat_id: "", party: "", purpose: "", qty: "", rate: "", amount: direction === "in" && ev.fund_per_flat ? String(ev.fund_per_flat) : "", mode: "Cash", reference: "", note: "", file_url: "", pass_type: "Member", jain: "", ...over });
  const open = (f: Form) => { setForm(f); setFile(null); setError(""); setTimeout(() => document.getElementById(`evform-${ev.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50); };
  function setCat(category: string) {
    if (!form) return;
    const amount = category === "Member fund" && ev.fund_per_flat ? String(ev.fund_per_flat) : category === "Passes" && ev.pass_price ? String(Number(ev.pass_price) * (Number(form.qty) || 1)) : form.amount;
    setForm({ ...form, category, amount, qty: category === "Passes" ? form.qty || "1" : form.qty, rate: category === "Passes" ? form.rate || String(ev.pass_price ?? "") : form.rate });
  }
  /** Passes: member = flat's head count at member price; guest = guest price */
  function setPass(p: Partial<Pick<Form, "pass_type" | "flat_id">>) {
    setForm((f) => { if (!f) return f;
      const n = { ...f, ...p };
      if (p.pass_type) n.rate = String(priceOf(p.pass_type) ?? "");
      if (n.pass_type === "Member" && p.flat_id !== undefined && p.flat_id) n.qty = String(Math.max(1, people[p.flat_id] || 1));
      const a = Number(n.qty) * Number(n.rate); return { ...n, amount: a ? String(a) : n.amount }; });
  }
  const setQR = (k: "qty" | "rate", v: string) => form && setForm((f) => { if (!f) return f; const n = { ...f, [k]: v }; const a = Number(n.qty) * Number(n.rate); return { ...n, amount: a ? String(a) : n.amount }; });

  async function save() {
    if (!form) return;
    const amt = Number(form.amount);
    if (!form.category) { setError("Choose the head."); return; }
    if (form.mode !== "In kind" && !(amt > 0)) { setError("Enter the amount."); return; }
    if (form.category === "Member fund" && !form.flat_id) { setError("Member fund needs the flat."); return; }
    if (form.category === "Passes" && Number(form.jain || 0) > Number(form.qty || 1)) { setError("Jain food cannot be more than the number of passes."); return; }
    setBusy(true); setError("");
    try {
      const file_url = file ? (await uploadFile(file, `eventdocs/${ev.id}`)).url : form.file_url || null;
      const row = { event_id: ev.id, direction: form.direction, entry_date: form.entry_date || today(), category: form.category, flat_id: form.flat_id || null, party: form.party.trim() || null,
        purpose: form.purpose.trim() || null, pass_type: form.category === "Passes" ? form.pass_type : null, jain_qty: form.category === "Passes" ? Number(form.jain || 0) || null : null, qty: form.qty ? Number(form.qty) : null, rate: form.rate ? Number(form.rate) : null, amount: amt || 0, mode: form.mode,
        reference: form.reference.trim() || null, note: form.note.trim() || null, file_url };
      const { error } = form.id ? await supabase.from("event_money").update({ ...row, updated_at: new Date().toISOString() }).eq("id", form.id)
        : await supabase.from("event_money").insert([{ ...row, created_by: email }]);
      if (error) throw error;
      setForm(null); setFile(null); await load();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  async function remove(m: Money) {
    if (!confirm(`Delete this entry?\n${particulars(flats, m)} • ₹${inr(m.amount)}`)) return;
    const { error } = await supabase.from("event_money").delete().eq("id", m.id);
    if (error) setError(error.message); else load();
  }
  async function saveSettings() {
    setBusy(true); setError("");
    const { error } = await supabase.rpc("set_event_money_settings", { p_event: ev.id, p_fund: set.fund ? Number(set.fund) : null, p_pass: set.pass ? Number(set.pass) : null, p_guest: set.guest ? Number(set.guest) : null, p_public: set.pub });
    setBusy(false);
    if (error) setError(error.message); else onSettings();
  }
  const edit = (m: Money) => open({ id: m.id, direction: m.direction, entry_date: m.entry_date, category: m.category, flat_id: m.flat_id || "", party: m.party || "", purpose: m.purpose || "", qty: m.qty ? String(m.qty) : "", rate: m.rate != null ? String(m.rate) : "", amount: String(m.amount), mode: m.mode, reference: m.reference || "", note: m.note || "", file_url: m.file_url || "", pass_type: m.pass_type === "Guest" ? "Guest" : "Member", jain: m.jain_qty ? String(m.jain_qty) : "" });
  const evT = { title: ev.title, event_date: ev.event_date, end_date: ev.end_date };

  if (list === null) return <div className="mono text-[11px] opacity-60">Loading…</div>;
  if (!seesAll) {
    return (
      <div className="mono text-[11px] space-y-2">
        <div className="opacity-60">The event's accounts are kept by the organising team. Your own payments for this event:</div>
        {list.length === 0 ? <div className="border border-dashed border-[var(--border)] p-4 text-center opacity-60">No payment recorded for your flat.</div> :
          list.map((m) => <div key={m.id} className="border border-[var(--border)] bg-[var(--bg)] p-2.5 flex justify-between gap-2"><span>{dmy(m.entry_date)} • {m.category}{m.purpose ? ` • ${m.purpose}` : ""}{m.qty ? ` • ${m.qty} pass${m.qty > 1 ? "es" : ""}` : ""}</span><b>{m.mode === "In kind" ? "in kind" : `₹${inr(m.amount)}`}</b></div>)}
      </div>);
  }

  const rows = list.filter((m) => dirF === "ALL" || m.direction === dirF).slice().reverse();
  const sponsors = list.filter((m) => m.category === "Sponsorship");
  const byPurpose = sponsors.reduce<Record<string, Money[]>>((r, m) => { const k = m.purpose?.trim() || "General"; (r[k] = r[k] || []).push(m); return r; }, {});
  const passes = list.filter((m) => m.category === "Passes");
  const fundRows = occupied.filter((f) => fundF === "ALL" || (fundF === "PAID" ? !!paid[f.id] : !paid[f.id]));
  const Btn = ({ v }: { v: (typeof VIEWS)[number] }) => <button onClick={() => setView(v)} className={`px-3 py-1.5 border ${view === v ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>{v}</button>;

  return (
    <div className="mono text-[11px] space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="border border-[var(--border)] bg-[var(--bg)] p-3"><div className="opacity-60 text-[10px]">MONEY IN</div><div className="text-[17px] font-bold text-emerald-700">₹{inr(t.income)}</div></div>
        <div className="border border-[var(--border)] bg-[var(--bg)] p-3"><div className="opacity-60 text-[10px]">MONEY OUT</div><div className="text-[17px] font-bold text-red-700">₹{inr(t.spent)}</div></div>
        <div className="border-2 border-[var(--navy)] bg-[var(--bg)] p-3"><div className="opacity-60 text-[10px]">{t.balance >= 0 ? "BALANCE IN HAND" : "SHORTFALL"}</div><div className="text-[17px] font-bold">₹{inr(Math.abs(t.balance))}</div></div>
        <div className="border border-[var(--border)] bg-[var(--bg)] p-3"><div className="opacity-60 text-[10px]">MEMBER FUND</div><div className="text-[17px] font-bold">{Object.keys(paid).length}<span className="text-[11px] font-normal opacity-60"> / {occupied.length} flats</span></div></div>
      </div>
      <div className="opacity-60">Kept separately from society maintenance billing. In-kind sponsorships are listed but not counted in cash.{ev.accounts_public ? " • Shown to all members." : " • Seen by the organising team and committee only."}</div>
      {msg && <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 p-2">{msg}</div>}
      {batch && <EventBatch kind={batch} eventId={ev.id} occupied={occupied} people={people} email={email}
        done={new Set((list || []).filter((m) => batch === "fund" ? m.category === "Member fund" : m.category === "Passes" && m.pass_type === "Member").map((m) => m.flat_id || ""))}
        price={batch === "fund" ? ev.fund_per_flat ?? null : ev.pass_price ?? null}
        onCancel={() => setBatch(null)} onDone={(n) => { setBatch(null); setMsg(`${n} entries posted.`); load(); }} />}
      {error && !form && <div className="border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}

      {canSettings && (
        <div className="flex flex-wrap gap-2 items-center border border-dashed border-[var(--border)] p-2.5">
          <span className="opacity-60">SETTINGS</span>
          <label className="flex items-center gap-1.5">Fund per flat ₹<input className="field !w-[90px]" inputMode="numeric" value={set.fund} onChange={(e) => setSet({ ...set, fund: e.target.value.replace(/[^\d.]/g, "") })} /></label>
          <label className="flex items-center gap-1.5">Member pass ₹<input className="field !w-[80px]" inputMode="numeric" value={set.pass} onChange={(e) => setSet({ ...set, pass: e.target.value.replace(/[^\d.]/g, "") })} /></label>
          <label className="flex items-center gap-1.5">Guest pass ₹<input className="field !w-[80px]" inputMode="numeric" value={set.guest} onChange={(e) => setSet({ ...set, guest: e.target.value.replace(/[^\d.]/g, "") })} /></label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={set.pub} onChange={(e) => setSet({ ...set, pub: e.target.checked })} /> Show accounts to all members</label>
          <button onClick={saveSettings} disabled={busy} className="btn-line px-3 py-1.5">SAVE</button>
        </div>)}

      <div className="flex flex-wrap gap-2 items-center">
        {canWrite && !form && <><button onClick={() => open(blank("in"))} className="btn-navy px-3 py-2 font-bold">+ MONEY IN</button><button onClick={() => open(blank("out"))} className="btn-line px-3 py-2 font-bold">+ MONEY OUT</button></>}
        <button onClick={() => openPrint(`${ev.title} statement`, eventStatementHtml(evT, list, flats, team))} className="btn-line px-3 py-2 ml-auto">🖨 STATEMENT</button>
      </div>

      {form && (
        <div id={`evform-${ev.id}`} className={`border-2 p-3 space-y-2 ${form.direction === "in" ? "border-emerald-600 bg-emerald-50/40" : "border-red-600 bg-red-50/40"}`}>
          <div className="flex gap-2 items-center">
            <b className="tracking-[0.1em]">{form.id ? "EDIT ENTRY" : form.direction === "in" ? "MONEY IN" : "MONEY OUT"}</b>
            {!form.id && <button onClick={() => setForm(blank(form.direction === "in" ? "out" : "in"))} className="underline opacity-70">switch to money {form.direction === "in" ? "out" : "in"}</button>}
          </div>
          {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="text-[10px] opacity-80">DATE<input type="date" className="field mt-1" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">HEAD *<select className="field mt-1" value={form.category} onChange={(e) => setCat(e.target.value)}>{(form.direction === "in" ? IN_CATS : OUT_CATS).map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-[10px] opacity-80">{form.direction === "in" ? "FROM FLAT" : "PAID BY / FOR FLAT"}{form.category === "Member fund" ? " *" : ""}<select className="field mt-1" value={form.flat_id} onChange={(e) => (form.category === "Passes" ? setPass({ flat_id: e.target.value }) : setForm({ ...form, flat_id: e.target.value }))}><option value="">— none / outside —</option>
              {[...flats].sort(sortFlats).map((f) => <option key={f.id} value={f.id}>{label(f)} • {residentName(f) || ownerText(f)}</option>)}</select></label>
            <label className="text-[10px] opacity-80">{form.direction === "in" ? "NAME (sponsor / buyer)" : "PAID TO (vendor)"}<input className="field mt-1" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} /></label>
            <label className="text-[10px] opacity-80 sm:col-span-2">FOR<input className="field mt-1" placeholder={PURPOSE_HINT[form.category] || "What it is for"} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></label>
            {form.category === "Passes" && <>
              <label className="text-[10px] opacity-80">PASS TYPE<select className="field mt-1" value={form.pass_type} onChange={(e) => setPass({ pass_type: e.target.value as any })}><option value="Member">Member{ev.pass_price != null ? ` – ₹${inr(ev.pass_price)}` : ""}</option><option value="Guest">Guest{ev.guest_pass_price != null ? ` – ₹${inr(ev.guest_pass_price)}` : ""}</option></select></label>
              <label className="text-[10px] opacity-80">NO. OF PASSES<input className="field mt-1" inputMode="numeric" value={form.qty} onChange={(e) => setQR("qty", e.target.value.replace(/\D/g, ""))} /></label>
              <label className="text-[10px] opacity-80 text-amber-800">OF WHICH JAIN FOOD<input className="field mt-1" inputMode="numeric" placeholder="0" value={form.jain} onChange={(e) => setForm({ ...form, jain: e.target.value.replace(/\D/g, "") })} /><span className="opacity-70">Normal: {Math.max(0, Number(form.qty || 0) - Number(form.jain || 0))}</span></label>
              <label className="text-[10px] opacity-80">PRICE PER PASS ₹<input className="field mt-1" inputMode="numeric" value={form.rate} onChange={(e) => setQR("rate", e.target.value.replace(/[^\d.]/g, ""))} /></label></>}
            <label className="text-[10px] opacity-80">AMOUNT ₹{form.mode === "In kind" ? " (value, optional)" : " *"}<input className="field mt-1 font-bold" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} /></label>
            <label className="text-[10px] opacity-80">MODE<select className="field mt-1" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Money["mode"] })}>{EV_MODES.filter((m) => form.direction === "in" || m !== "In kind").map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="text-[10px] opacity-80">UPI REF / CHEQUE NO.<input className="field mt-1" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
            <label className="text-[10px] opacity-80">NOTE<input className="field mt-1" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <label className="text-[10px] opacity-80 sm:col-span-2">{form.direction === "out" ? "BILL / RECEIPT PHOTO" : "PROOF (optional)"}{form.file_url && !file && <span className="ml-1 text-emerald-700">• attached</span>}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="field mt-1 !py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          </div>
          <div className="flex gap-2"><button onClick={save} disabled={busy} className="btn-navy px-4 py-2 font-bold">{busy ? "SAVING…" : "SAVE ENTRY"}</button><button onClick={() => { setForm(null); setError(""); }} className="btn-line px-4 py-2">CANCEL</button></div>
        </div>)}

      <div className="flex flex-wrap gap-1.5">{VIEWS.map((v) => <Btn key={v} v={v} />)}</div>

      {view === "ENTRIES" && (
        <div className="border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex justify-between items-center p-2.5"><b>{rows.length} entr{rows.length === 1 ? "y" : "ies"}</b>
            <select className="field !w-auto" value={dirF} onChange={(e) => setDirF(e.target.value as any)}><option value="ALL">All</option><option value="in">Money in</option><option value="out">Money out</option></select></div>
          <div className="overflow-x-auto"><table className="w-full text-[11.5px] min-w-[720px]">
            <thead><tr className="bg-[var(--navy)] text-white text-left text-[10px]"><th className="px-2.5 py-1.5">DATE</th><th className="px-2.5 py-1.5">PARTICULARS</th><th className="px-2.5 py-1.5 text-right">IN</th><th className="px-2.5 py-1.5 text-right">OUT</th><th className="px-2.5 py-1.5">MODE</th><th className="px-2.5 py-1.5"></th></tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)] align-top">
                <td className="px-2.5 py-1.5 whitespace-nowrap">{dmy(m.entry_date)}</td>
                <td className="px-2.5 py-1.5">{particulars(flats, m)}{m.note ? <div className="opacity-60">{m.note}</div> : null}</td>
                <td className="px-2.5 py-1.5 text-right text-emerald-700 font-bold whitespace-nowrap">{m.direction === "in" ? (m.mode === "In kind" ? "in kind" : `₹${inr(m.amount)}`) : ""}</td>
                <td className="px-2.5 py-1.5 text-right text-red-700 font-bold whitespace-nowrap">{m.direction === "out" ? `₹${inr(m.amount)}` : ""}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{m.mode}{m.reference ? <div className="opacity-60">{m.reference}</div> : null}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-right">{m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="underline mr-2">bill</a>}
                  {canWrite && <><button onClick={() => edit(m)} className="underline mr-2">edit</button><button onClick={() => remove(m)} className="underline text-red-600">delete</button></>}</td>
              </tr>))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center opacity-60">No entries yet.{canWrite ? " Use + MONEY IN / + MONEY OUT." : ""}</td></tr>}</tbody>
          </table></div>
        </div>)}

      {view === "MEMBER FUND" && (
        <div className="border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-2">
          <div className="flex flex-wrap gap-2 items-center"><b>{ev.fund_per_flat ? `₹${inr(ev.fund_per_flat)} per flat • ` : ""}paid {Object.keys(paid).length} of {occupied.length} • ₹{inr(Object.values(paid).reduce((s, a) => s + a, 0))}</b>
            <select className="field !w-auto ml-auto" value={fundF} onChange={(e) => setFundF(e.target.value as any)}><option>ALL</option><option>PAID</option><option>NOT PAID</option></select>
            {canWrite && !batch && <button onClick={() => { setMsg(""); setBatch("fund"); }} className="btn-navy px-3 py-1.5">POST BY TOWER</button>}
            <button onClick={() => openPrint(`${ev.title} fund`, fundListHtml(evT, list, occupied, ev.fund_per_flat ?? null))} className="btn-line px-3 py-1.5">🖨 LIST</button></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {fundRows.map((f) => (
              <div key={f.id} className={`border p-2 flex items-center gap-2 ${paid[f.id] ? "border-emerald-200 bg-emerald-50/50" : "border-[var(--border)] bg-[var(--bg)]"}`}>
                <b className="w-[54px]">{label(f)}</b><span className="flex-1 truncate">{residentName(f) || ownerText(f)}{!isOccupied(f) && <span className="opacity-50"> • not occupied</span>}</span>
                {paid[f.id] ? <b className="text-emerald-700">₹{inr(paid[f.id])}</b> : canWrite ? <button onClick={() => open(blank("in", { flat_id: f.id }))} className="underline">+ paid</button> : <span className="opacity-40">—</span>}
              </div>))}
          </div>
        </div>)}

      {view === "SPONSORS" && (
        <div className="border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-2.5">
          {canWrite && <button onClick={() => open(blank("in", { category: "Sponsorship", amount: "" }))} className="btn-navy px-3 py-1.5">+ SPONSORSHIP</button>}
          {Object.keys(byPurpose).length === 0 && <div className="opacity-60">No sponsorships yet. Record dinners, prizes and other sponsorships with + SPONSORSHIP; use mode "In kind" when the sponsor gives items instead of money.</div>}
          {Object.entries(byPurpose).sort().map(([p, ms]) => (
            <div key={p}>{(() => { const cash = ms.filter((m) => m.mode !== "In kind").reduce((s, m) => s + Number(m.amount), 0); return <div className="font-bold">{p}{cash > 0 && <span className="opacity-60 font-normal"> • ₹{inr(cash)}</span>}</div>; })()}
              {ms.map((m) => <div key={m.id} className="flex justify-between gap-2 border-b border-dashed border-[var(--border)] py-1"><span>{partyOf(flats, m)}{m.note ? <span className="opacity-60"> • {m.note}</span> : null}</span><b>{m.mode === "In kind" ? "in kind" : `₹${inr(m.amount)}`}</b></div>)}</div>))}
        </div>)}

      {view === "PASSES" && (
        <div className="border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-2">
          <div className="flex flex-wrap gap-2 items-center"><b>{passes.reduce((s, m) => s + Number(m.qty || 1), 0)} passes • ₹{inr(passes.reduce((s, m) => s + Number(m.amount), 0))}{ev.pass_price != null ? ` • member ₹${inr(ev.pass_price)}` : ""}{ev.guest_pass_price != null ? ` • guest ₹${inr(ev.guest_pass_price)}` : ""}</b>
            {passes.length > 0 && (() => { const fd = food(passes); return <span className="border-2 border-[var(--navy)] px-2 py-1 font-bold">FOOD: {fd.normal} normal • <span className="text-amber-800">{fd.jain} Jain</span></span>; })()}
            {canWrite && !batch && <button onClick={() => { setMsg(""); setBatch("passes"); }} className="btn-navy px-3 py-1.5">MEMBER PASSES BY TOWER</button>}
            {canWrite && <button onClick={() => open(blank("in", { category: "Passes", pass_type: "Guest", qty: "1", rate: String(ev.guest_pass_price ?? ""), amount: String(ev.guest_pass_price ?? ""), purpose: "" }))} className="btn-line px-3 py-1.5">+ GUEST PASSES</button>}
            {canWrite && <button onClick={() => open(blank("in", { category: "Passes", pass_type: "Member", qty: "1", rate: String(ev.pass_price ?? ""), amount: String(ev.pass_price ?? "") }))} className="btn-line px-3 py-1.5">+ MEMBER PASSES</button>}
            <button onClick={() => openPrint(`${ev.title} passes`, passListHtml(evT, list, flats))} className="btn-line px-3 py-1.5 ml-auto">🖨 GATE LIST</button></div>
          {passes.length === 0 ? <div className="opacity-60">No passes sold yet. Set the member and guest pass prices in SETTINGS first.</div> :
            passes.map((m) => <div key={m.id} className="flex justify-between gap-2 border-b border-dashed border-[var(--border)] py-1"><span>{m.pass_type && <span className={`tag mr-1.5 ${m.pass_type === "Guest" ? "bg-amber-50 text-amber-800" : "bg-[var(--bg)]"}`}>{m.pass_type.toUpperCase()}</span>}{partyOf(flats, m)}{m.purpose && m.purpose !== "Member passes" ? ` • ${m.purpose}` : ""}</span><b className="whitespace-nowrap">{m.qty || 1} × ₹{inr(m.rate ?? m.amount)}{m.jain_qty ? <span className="text-amber-800"> • {m.jain_qty} Jain</span> : null}</b></div>)}
        </div>)}
    </div>
  );
}
