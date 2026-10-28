"use client";
// COMMITTEE tab (committee only): areas of responsibility (one accountable person per area) and the AMC register.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { byCommitteeRole, committeeName, label, ownerText, type Flat } from "@/lib/society";
import { dmy, inr, num, today } from "@/lib/billing";
import { uploadFile } from "@/lib/ledgerClient";
import { amcAlerts, amcState, daysLeft, loadAmc, loadAreas, personOf, type Amc, type Area, type Visit } from "@/lib/committee";
import type { Ctx } from "./ctx";
import MinutesPanel from "./MinutesPanel";
import ComplaintsPanel from "./ComplaintsPanel";
import BookingPanel from "./BookingPanel";
import { loadComplaints } from "@/lib/complaints";
import { isOverdue, loadMeetings, type Action, type Meeting } from "@/lib/minutes";
import { FileLink } from "./SecureFile";

const VIEWS = ["COMPLAINTS", "BOOKINGS", "RESPONSIBILITIES", "AMC CONTRACTS", "MINUTES"] as const;
type View = (typeof VIEWS)[number];
const addYear = (d: string) => { const x = new Date(d); x.setFullYear(x.getFullYear() + 1); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };
const nextDay = (d: string) => { const x = new Date(d); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };

export default function CommitteeTab({ ctx }: { ctx: Ctx }) {
  const [view, setView] = useState<View>("COMPLAINTS");
  const [areas, setAreas] = useState<Area[] | null | undefined>(undefined);
  const [amc, setAmc] = useState<{ amc: Amc[]; visits: Visit[] } | null | undefined>(undefined);
  const [mins, setMins] = useState<{ meetings: Meeting[]; actions: Action[] } | null | undefined>(undefined);
  const [openComplaints, setOpenComplaints] = useState(0);
  const [waitingBookings, setWaitingBookings] = useState(0);
  async function load() { const [a, m, mt] = await Promise.all([loadAreas(true), loadAmc(), loadMeetings()]); setAreas(a); setAmc(m); setMins(mt && { meetings: mt.meetings.filter((x) => x.kind !== "Event"), actions: mt.actions.filter((x) => mt.meetings.some((y) => y.id === x.meeting_id && y.kind !== "Event")) }); }
  useEffect(() => {
    load(); loadComplaints().then((c) => setOpenComplaints((c || []).filter((x) => x.status !== "closed").length));
    supabase.from("bookings").select("group_id").eq("status", "pending").then(({ data }) => setWaitingBookings(new Set(((data as any[]) || []).map((r) => r.group_id)).size));
  }, []);
  const committee = useMemo(() => ctx.flats.filter((f) => f.is_committee).sort(byCommitteeRole), [ctx.flats]);

  if (areas === undefined || amc === undefined) return <div className="mono text-[12px] opacity-60 p-6">Loading…</div>;
  if (areas === null || amc === null) return <div className="border border-dashed border-[var(--border)] p-8 text-center mono text-[12px] opacity-80">Run <b>COMMITTEE_AMC.sql</b> in Supabase to turn on areas of responsibility and the AMC register.</div>;
  const alerts = amcAlerts(amc.amc);
  const unassigned = areas.filter((a) => a.active && !a.holder_flat).length;

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 flex flex-wrap justify-between gap-4 items-center">
        <div>
          <div className="serif text-[22px] font-bold">Committee</div>
          <div className="mono text-[11px] opacity-60">{areas.filter((a) => a.active).length} areas{unassigned ? <> • <b className="text-amber-700">{unassigned} without a responsible member</b></> : ""} • {amc.amc.filter((a) => a.status === "active").length} AMC contracts{alerts.length ? <> • <b className="text-red-700">{alerts.length} need renewal</b></> : ""}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => { const n = v === "COMPLAINTS" ? openComplaints : v === "BOOKINGS" ? waitingBookings : v === "AMC CONTRACTS" ? alerts.length : v === "MINUTES" ? (mins?.actions || []).filter(isOverdue).length : unassigned; return (
            <button key={v} onClick={() => setView(v)} className={`mono text-[11px] font-bold tracking-[0.06em] px-3 py-2 border rounded-[3px] ${view === v ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--gold)]"}`}>
              {v}{n > 0 && <span className={`ml-1.5 inline-block min-w-[18px] px-1 rounded-full text-white text-[10px] ${v === "RESPONSIBILITIES" ? "bg-amber-600" : "bg-red-600"}`}>{n}</span>}</button>); })}
        </div>
      </div>
      {view === "COMPLAINTS" && <ComplaintsPanel mode="committee" flats={ctx.flats} flatId={ctx.homeFlat} isCommittee onCount={setOpenComplaints} />}
      {view === "BOOKINGS" && <BookingPanel mode="committee" flats={ctx.flats} flatId={ctx.homeFlat} isCommittee onCount={setWaitingBookings} />}
      {view === "RESPONSIBILITIES" && <Responsibilities areas={areas} committee={committee} flats={ctx.flats} email={ctx.email} amc={amc.amc} onChanged={load} />}
      {view === "AMC CONTRACTS" && <AmcRegister data={amc} areas={areas} flats={ctx.flats} email={ctx.email} onChanged={load} />}
      {view === "MINUTES" && (mins ? <MinutesPanel data={mins} flats={ctx.flats} committee={committee} email={ctx.email} onChanged={load} />
        : <div className="border border-dashed border-[var(--border)] p-8 text-center mono text-[12px] opacity-80">Run <b>MINUTES.sql</b> in Supabase to turn on minutes of meetings.</div>)}
    </div>
  );
}

/* ---------------- areas of responsibility ---------------- */
function Responsibilities({ areas, committee, flats, email, amc, onChanged }: { areas: Area[]; committee: Flat[]; flats: Flat[]; email: string; amc: Amc[]; onChanged: () => void }) {
  const [edit, setEdit] = useState<Record<string, Partial<Area>>>({});
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [nw, setNw] = useState({ name: "", description: "" });
  const val = (a: Area, k: keyof Area) => (edit[a.id] && k in edit[a.id] ? (edit[a.id] as any)[k] : (a as any)[k]) ?? "";
  const set = (a: Area, k: keyof Area, v: any) => setEdit((e) => ({ ...e, [a.id]: { ...e[a.id], [k]: v } }));
  const dirty = Object.keys(edit).length > 0;
  const opt = (f: Flat) => <option key={f.id} value={f.id}>{f.is_committee ? committeeName(f) : ownerText(f)}{f.committee_role ? ` – ${f.committee_role}` : ""} ({label(f)})</option>;

  async function saveAll() {
    setBusy(true); setError("");
    for (const [id, ch] of Object.entries(edit)) {
      const upd: any = { ...ch, updated_by: email, updated_at: new Date().toISOString() };
      for (const k of ["holder_flat", "backup_flat", "contact_phone", "description"]) if (k in upd && !upd[k]) upd[k] = null;
      if ("name" in upd && !String(upd.name).trim()) { setError("An area needs a name."); setBusy(false); return; }
      const { error } = await supabase.from("committee_areas").update(upd).eq("id", id);
      if (error) { setError(error.message); setBusy(false); return; }
    }
    setEdit({}); setBusy(false); onChanged();
  }
  async function add() {
    if (!nw.name.trim()) { setError("Enter the name of the area."); return; }
    const { error } = await supabase.from("committee_areas").insert([{ name: nw.name.trim(), description: nw.description.trim() || null, sort: (areas.reduce((m, a) => Math.max(m, a.sort), 0) || 0) + 10, updated_by: email }]);
    if (error) setError(error.message); else { setNw({ name: "", description: "" }); onChanged(); }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] mono text-[11px]">
      <div className="flex flex-wrap justify-between items-center gap-3 p-5">
        <div><div className="serif text-[18px] font-bold">Areas of responsibility</div>
          <div className="opacity-60 mt-0.5 max-w-[760px]">The committee works as a team; each area has one member who is accountable, including for outside parties (vendors, agencies, authorities). Members see this as "Who to contact" on the home page. A phone number is shown to members only if you fill it in.</div></div>
        {dirty && <div className="flex gap-2"><button onClick={() => setEdit({})} className="btn-line px-3 py-2">DISCARD</button><button onClick={saveAll} disabled={busy} className="btn-navy px-4 py-2 font-bold">{busy ? "SAVING…" : "SAVE CHANGES"}</button></div>}
      </div>
      {committee.length === 0 && <div className="mx-5 mb-3 border border-amber-200 bg-amber-50 p-2.5">No committee members are marked yet. Tick "Committee member" on their flat (DETAIL) to choose them here.</div>}
      {error && <div className="mx-5 mb-3 border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
      <div className="overflow-x-auto border-t border-[var(--border)]">
        <table className="w-full text-[12px] min-w-[1050px]">
          <thead><tr className="bg-[var(--navy)] text-white text-left text-[10px] tracking-[0.08em]">
            <th className="px-3 py-2">AREA</th><th className="px-3 py-2">COVERS</th><th className="px-3 py-2">RESPONSIBLE MEMBER</th><th className="px-3 py-2">BACKUP</th><th className="px-3 py-2">PHONE FOR MEMBERS</th><th className="px-3 py-2">AMC</th><th className="px-3 py-2">SHOW</th></tr></thead>
          <tbody>{areas.map((a) => { const n = amc.filter((c) => c.area_id === a.id && c.status === "active").length; return (
            <tr key={a.id} className={`border-b border-[var(--border)] align-top ${edit[a.id] ? "bg-[#fffbea]" : ""} ${val(a, "active") ? "" : "opacity-50"}`}>
              <td className="px-3 py-2"><input className="field !py-1 font-bold" value={val(a, "name")} onChange={(e) => set(a, "name", e.target.value)} /></td>
              <td className="px-3 py-2"><input className="field !py-1" value={val(a, "description")} onChange={(e) => set(a, "description", e.target.value)} /></td>
              <td className="px-3 py-2"><select className={`field !py-1 ${!val(a, "holder_flat") ? "!border-amber-400" : ""}`} value={val(a, "holder_flat")} onChange={(e) => set(a, "holder_flat", e.target.value)}><option value="">— not assigned —</option>{committee.map(opt)}</select></td>
              <td className="px-3 py-2"><select className="field !py-1" value={val(a, "backup_flat")} onChange={(e) => set(a, "backup_flat", e.target.value)}><option value="">—</option>{committee.map(opt)}</select></td>
              <td className="px-3 py-2"><input className="field !py-1 !w-[130px]" inputMode="tel" placeholder="optional" value={val(a, "contact_phone")} onChange={(e) => set(a, "contact_phone", e.target.value)} /></td>
              <td className="px-3 py-2 whitespace-nowrap">{n ? `${n} contract${n > 1 ? "s" : ""}` : <span className="opacity-40">—</span>}</td>
              <td className="px-3 py-2"><input type="checkbox" checked={!!val(a, "active")} onChange={(e) => set(a, "active", e.target.checked)} title="Show this area to members" /></td>
            </tr>); })}
          </tbody>
        </table>
      </div>
      <div className="p-5 flex flex-wrap gap-2 items-end border-t border-[var(--border)]">
        <label className="text-[10px] opacity-80">NEW AREA<input className="field mt-1 !w-[220px]" placeholder="e.g. Fire safety" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></label>
        <label className="text-[10px] opacity-80">COVERS<input className="field mt-1 !w-[320px]" placeholder="e.g. Extinguishers, fire NOC" value={nw.description} onChange={(e) => setNw({ ...nw, description: e.target.value })} /></label>
        <button onClick={add} className="btn-navy px-4 py-2.5">+ ADD AREA</button>
        <span className="opacity-60 ml-2">Untick SHOW to hide an area from members without deleting it.</span>
      </div>
    </div>
  );
}

/* ---------------- AMC register ---------------- */
type Form = { id?: string; renewed_from?: string; area_id: string; vendor: string; contact_person: string; contact_phone: string; covers: string; start_date: string; end_date: string; amount: string; payment_terms: string; visits_per_year: string; file_key: string; notes: string };
const blankForm = (): Form => ({ area_id: "", vendor: "", contact_person: "", contact_phone: "", covers: "", start_date: today(), end_date: addYear(today()), amount: "", payment_terms: "", visits_per_year: "", file_key: "", notes: "" });

function AmcRegister({ data, areas, flats, email, onChanged }: { data: { amc: Amc[]; visits: Visit[] }; areas: Area[]; flats: Flat[]; email: string; onChanged: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [openVisits, setOpenVisits] = useState<string | null>(null);
  const [vf, setVf] = useState({ visit_date: today(), done_by: "", work: "", checked_by: "" });
  const [showOld, setShowOld] = useState(false);
  const areaOf = (id: string | null) => areas.find((a) => a.id === id);
  const list = data.amc.filter((a) => showOld || a.status === "active").sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.end_date.localeCompare(b.end_date));
  const alerts = amcAlerts(data.amc);
  const visitsOf = (id: string) => data.visits.filter((v) => v.amc_id === id);
  const yearly = data.amc.filter((a) => a.status === "active").reduce((n, a) => n + num(a.amount), 0);

  function startEdit(a: Amc) { setFile(null); setError(""); setForm({ id: a.id, area_id: a.area_id || "", vendor: a.vendor, contact_person: a.contact_person || "", contact_phone: a.contact_phone || "", covers: a.covers, start_date: a.start_date, end_date: a.end_date, amount: a.amount != null ? String(a.amount) : "", payment_terms: a.payment_terms || "", visits_per_year: a.visits_per_year != null ? String(a.visits_per_year) : "", file_key: a.file_key || "", notes: a.notes || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function startRenew(a: Amc) { const s = nextDay(a.end_date); setFile(null); setError(""); setForm({ renewed_from: a.id, area_id: a.area_id || "", vendor: a.vendor, contact_person: a.contact_person || "", contact_phone: a.contact_phone || "", covers: a.covers, start_date: s, end_date: addYear(s), amount: a.amount != null ? String(a.amount) : "", payment_terms: a.payment_terms || "", visits_per_year: a.visits_per_year != null ? String(a.visits_per_year) : "", file_key: "", notes: "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function save() {
    if (!form) return;
    if (!form.vendor.trim() || !form.covers.trim()) { setError("Enter the vendor and what the contract covers."); return; }
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) { setError("Check the contract dates."); return; }
    setBusy(true); setError("");
    try {
      let file_key = form.file_key || null;
      if (file) file_key = (await uploadFile(file, "amc")).url;
      const row: any = { area_id: form.area_id || null, vendor: form.vendor.trim(), contact_person: form.contact_person.trim() || null, contact_phone: form.contact_phone.trim() || null,
        covers: form.covers.trim(), start_date: form.start_date, end_date: form.end_date, amount: form.amount ? num(form.amount) : null, payment_terms: form.payment_terms.trim() || null,
        visits_per_year: form.visits_per_year ? Math.round(num(form.visits_per_year)) : null, file_key, notes: form.notes.trim() || null, updated_at: new Date().toISOString() };
      if (form.id) { const { error } = await supabase.from("amc_contracts").update(row).eq("id", form.id); if (error) throw error; }
      else {
        const { error } = await supabase.from("amc_contracts").insert([{ ...row, renewed_from: form.renewed_from || null, created_by: email }]); if (error) throw error;
        if (form.renewed_from) await supabase.from("amc_contracts").update({ status: "renewed", updated_at: new Date().toISOString() }).eq("id", form.renewed_from);
      }
      setForm(null); setFile(null); onChanged();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  async function close(a: Amc) {
    if (!confirm(`Close the contract with ${a.vendor} (${a.covers})?\nUse this when the society stops the contract. It stays in the register as CLOSED.`)) return;
    const { error } = await supabase.from("amc_contracts").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) setError(error.message); else onChanged();
  }
  async function addVisit(a: Amc) {
    if (!vf.visit_date || !vf.work.trim()) { setError("Enter the visit date and what was done."); return; }
    const { error } = await supabase.from("amc_visits").insert([{ amc_id: a.id, visit_date: vf.visit_date, done_by: vf.done_by.trim() || null, work: vf.work.trim(), checked_by: vf.checked_by.trim() || null, created_by: email }]);
    if (error) setError(error.message); else { setVf({ visit_date: today(), done_by: "", work: "", checked_by: "" }); onChanged(); }
  }
  const tagCls = (k: string) => k === "expired" ? "bg-red-50 text-red-700" : k === "expiring" ? "bg-amber-50 text-amber-700" : k === "active" ? "bg-emerald-50 text-emerald-700" : "bg-[var(--bg-soft)] text-[var(--muted)]";
  const F = (k: keyof Form, l: string, extra: any = {}) => <label className={`text-[10px] opacity-80 ${extra.w || ""}`}>{l}<input className="field mt-1" type={extra.type || "text"} inputMode={extra.im} placeholder={extra.ph} value={(form as any)[k]} onChange={(e) => setForm({ ...(form as Form), [k]: e.target.value })} /></label>;

  return (
    <div className="space-y-4 mono text-[11px]">
      {alerts.length > 0 && (
        <div className="border-2 border-red-300 bg-red-50 p-4">
          <div className="font-bold tracking-[0.1em] text-red-800">RENEWAL DUE</div>
          {alerts.map((a) => { const s = amcState(a); const p = personOf(flats, areaOf(a.area_id)?.holder_flat || null); return (
            <div key={a.id} className="mt-1.5 flex flex-wrap gap-2 items-center"><span className={`tag ${tagCls(s.key)}`}>{s.text}</span><b>{a.covers}</b><span>• {a.vendor} • ends {dmy(a.end_date)}</span>{p && <span className="opacity-70">• {p.name}{p.role ? ` (${p.role})` : ""}</span>}
              <button onClick={() => startRenew(a)} className="underline font-bold text-[var(--navy)]">renew</button></div>); })}
        </div>
      )}

      {form ? (
        <div className="border-2 border-[var(--gold)] bg-[#fffdf5] p-4 space-y-3">
          <div className="font-bold tracking-[0.1em] text-[#8a6d14]">{form.id ? "EDIT CONTRACT" : form.renewed_from ? "RENEW CONTRACT (new period)" : "NEW AMC CONTRACT"}</div>
          {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
          <div className="grid md:grid-cols-3 gap-3">
            {F("covers", "WHAT IT COVERS *", { ph: "e.g. Lifts – Tower A, B, C" })}
            {F("vendor", "VENDOR *", { ph: "e.g. Shree Elevators Pvt. Ltd." })}
            <label className="text-[10px] opacity-80">AREA (RESPONSIBLE MEMBER)<select className="field mt-1" value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}><option value="">—</option>
              {areas.map((a) => { const p = personOf(flats, a.holder_flat); return <option key={a.id} value={a.id}>{a.name}{p ? ` – ${p.name}` : ""}</option>; })}</select></label>
            {F("contact_person", "VENDOR CONTACT PERSON")}
            {F("contact_phone", "VENDOR PHONE", { im: "tel" })}
            {F("payment_terms", "PAYMENT TERMS", { ph: "e.g. Quarterly in advance" })}
            {F("start_date", "START DATE *", { type: "date" })}
            {F("end_date", "END DATE *", { type: "date" })}
            <div className="grid grid-cols-2 gap-2">{F("amount", "AMOUNT ₹ (FOR THE PERIOD)", { im: "decimal" })}{F("visits_per_year", "SERVICE VISITS / YEAR", { im: "numeric" })}</div>
          </div>
          <div className="grid md:grid-cols-[2fr_1fr] gap-3">
            {F("notes", "NOTES", { ph: "e.g. Includes parts except motor; 24-hour breakdown response" })}
            <label className="text-[10px] opacity-80">CONTRACT COPY (PDF / PHOTO){form.file_key && !file && <span className="ml-1 text-emerald-700">• attached</span>}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="field mt-1 !py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          </div>
          <div className="flex gap-2"><button onClick={save} disabled={busy} className="btn-navy px-4 py-2.5 font-bold">{busy ? "SAVING…" : "SAVE CONTRACT"}</button><button onClick={() => setForm(null)} className="btn-line px-4 py-2.5">CANCEL</button></div>
        </div>
      ) : error && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px]">
        <div className="flex flex-wrap justify-between items-center gap-3 p-5">
          <div><div className="serif text-[18px] font-bold">AMC register</div>
            <div className="opacity-60 mt-0.5">{data.amc.filter((a) => a.status === "active").length} active contracts • ₹{inr(yearly)} for the current periods • reminder 30 days before each contract ends</div></div>
          <div className="flex gap-3 items-center">
            {data.amc.some((a) => a.status !== "active") && <label className="flex items-center gap-1.5"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show renewed / closed</label>}
            {!form && <button onClick={() => { setForm(blankForm()); setFile(null); setError(""); }} className="btn-navy px-4 py-2 font-bold">+ ADD CONTRACT</button>}
          </div>
        </div>
        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-[12px] min-w-[1100px]">
            <thead><tr className="bg-[var(--navy)] text-white text-left text-[10px] tracking-[0.08em]">
              <th className="px-3 py-2">COVERS</th><th className="px-3 py-2">VENDOR</th><th className="px-3 py-2">RESPONSIBLE</th><th className="px-3 py-2">PERIOD</th><th className="px-3 py-2 text-right">AMOUNT ₹</th><th className="px-3 py-2">VISITS</th><th className="px-3 py-2">STATUS</th><th className="px-3 py-2"></th></tr></thead>
            <tbody>
              {list.map((a) => { const s = amcState(a); const ar = areaOf(a.area_id); const p = personOf(flats, ar?.holder_flat || null); const vs = visitsOf(a.id); return [
                <tr key={a.id} className={`border-b border-[var(--border)] align-top ${s.key === "expired" ? "bg-red-50/40" : s.key === "expiring" ? "bg-amber-50/50" : ""} ${a.status !== "active" ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2.5 font-bold">{a.covers}{a.notes && <div className="font-normal opacity-60 text-[11px]">{a.notes}</div>}</td>
                  <td className="px-3 py-2.5">{a.vendor}<div className="opacity-60 text-[11px]">{[a.contact_person, a.contact_phone].filter(Boolean).join(" • ")}</div></td>
                  <td className="px-3 py-2.5">{p ? <>{p.name}<div className="opacity-60 text-[11px]">{ar?.name}{p.role ? ` • ${p.role}` : ""}</div></> : <span className="opacity-40">{ar?.name || "—"}</span>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{dmy(a.start_date)} –<br />{dmy(a.end_date)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{a.amount != null ? inr(a.amount) : "—"}<div className="opacity-60 text-[11px]">{a.payment_terms || ""}</div></td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><button onClick={() => setOpenVisits(openVisits === a.id ? null : a.id)} className="underline">{vs.length}{a.visits_per_year ? ` / ${a.visits_per_year} per yr` : ""} {openVisits === a.id ? "▲" : "▼"}</button>
                    {vs[0] && <div className="opacity-60 text-[11px]">last {dmy(vs[0].visit_date)}</div>}</td>
                  <td className="px-3 py-2.5"><span className={`tag ${tagCls(s.key)}`}>{s.text}</span>{a.status === "active" && s.key === "active" && <div className="opacity-60 text-[11px] mt-1">{daysLeft(a.end_date)} days left</div>}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    {a.file_key && <FileLink file={a.file_key} className="underline mr-3">contract</FileLink>}
                    {a.status === "active" && <><button onClick={() => startRenew(a)} className="underline mr-3 font-bold text-[var(--navy)]">renew</button><button onClick={() => startEdit(a)} className="underline mr-3">edit</button><button onClick={() => close(a)} className="underline text-red-600">close</button></>}</td>
                </tr>,
                openVisits === a.id && (
                  <tr key={a.id + "v"} className="bg-[var(--bg)] border-b border-[var(--border)]"><td colSpan={8} className="px-5 py-3">
                    <div className="font-bold tracking-[0.1em] text-[10px] mb-2">SERVICE VISITS • {a.covers}</div>
                    {vs.length === 0 && <div className="opacity-60 mb-2">No visits logged yet.</div>}
                    {vs.map((v) => <div key={v.id} className="flex flex-wrap gap-3 py-1 border-b border-dashed border-[var(--border)]"><b className="whitespace-nowrap">{dmy(v.visit_date)}</b><span className="flex-1 min-w-[200px]">{v.work}</span><span className="opacity-70">{v.done_by ? `by ${v.done_by}` : ""}{v.checked_by ? ` • checked by ${v.checked_by}` : ""}</span></div>)}
                    {a.status === "active" && <div className="flex flex-wrap gap-2 items-end mt-3">
                      <label className="text-[10px] opacity-80">DATE<input type="date" className="field mt-1 !w-[150px]" value={vf.visit_date} onChange={(e) => setVf({ ...vf, visit_date: e.target.value })} /></label>
                      <label className="text-[10px] opacity-80 flex-1 min-w-[220px]">WHAT WAS DONE *<input className="field mt-1" placeholder="e.g. Quarterly service, ropes oiled, Tower B door sensor replaced" value={vf.work} onChange={(e) => setVf({ ...vf, work: e.target.value })} /></label>
                      <label className="text-[10px] opacity-80">TECHNICIAN<input className="field mt-1 !w-[150px]" value={vf.done_by} onChange={(e) => setVf({ ...vf, done_by: e.target.value })} /></label>
                      <label className="text-[10px] opacity-80">CHECKED BY<input className="field mt-1 !w-[150px]" value={vf.checked_by} onChange={(e) => setVf({ ...vf, checked_by: e.target.value })} /></label>
                      <button onClick={() => addVisit(a)} className="btn-navy px-3 py-2.5">+ LOG VISIT</button></div>}
                  </td></tr>
                ),
              ]; })}
              {list.length === 0 && <tr><td colSpan={8} className="px-5 py-6 text-center opacity-60">No contracts yet. Add the lift, borewell, fire system and generator AMCs with + ADD CONTRACT.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
