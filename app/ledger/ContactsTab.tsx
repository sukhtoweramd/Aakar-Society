"use client";
// CONTACTS tab: important phone numbers for the society (lift, fire, security, plumber …), from society_contacts.
// Members see the active contacts and can tap to call. Committee logins add, edit and switch contacts off/on.
// Switching off hides a contact from members; nothing is ever deleted (the database has no delete rule).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CONTACT_CATEGORIES, contactError, groupContacts, matchContact, telHref, type Contact } from "@/lib/contacts";
import { loadAmc, loadAreas, type Amc, type Area } from "@/lib/committee";
import WhoToContact from "./WhoToContact";
import type { Ctx } from "./ctx";

type Form = { id?: string; category: string; name: string; contact_person: string; phone: string; alt_phone: string; notes: string; sort_order: string; amc_id: string };
const BLANK: Form = { category: "", name: "", contact_person: "", phone: "", alt_phone: "", notes: "", sort_order: "100", amc_id: "" };
const toForm = (c: Contact): Form => ({ id: c.id, category: c.category, name: c.name, contact_person: c.contact_person || "", phone: c.phone || "",
  alt_phone: c.alt_phone || "", notes: c.notes || "", sort_order: String(c.sort_order ?? 100), amc_id: c.amc_id || "" });

function Phone({ n }: { n: string | null }) {
  const href = telHref(n);
  if (!n?.trim()) return null;
  return href
    ? <a href={href} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 border border-[var(--navy)] bg-white text-[var(--navy)] font-bold rounded-[3px] text-[14px] tabular-nums">📞 {n}</a>
    : <span className="text-[13px]">{n}</span>;
}

export default function ContactsTab({ ctx }: { ctx: Ctx }) {
  const { isCommittee } = ctx;
  const [list, setList] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [q, setQ] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [amc, setAmc] = useState<Amc[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  async function load() {
    const { data, error } = await supabase.from("society_contacts").select("*").order("sort_order").order("category").order("name");
    if (error) { if (/society_contacts/.test(error.message)) setMissing(true); else setError(error.message); setList([]); return; }
    setMissing(false); setList((data as Contact[]) || []);
  }
  useEffect(() => {
    load();
    loadAreas().then((a) => setAreas((a || []).filter((x) => x.holder_flat)));
    if (isCommittee) loadAmc().then((d) => setAmc(d ? d.amc.filter((a) => a.status !== "renewed") : []));
  }, [isCommittee]);

  const shown = useMemo(() => (list || []).filter((c) => (showOff || c.active) && matchContact(c, q)), [list, showOff, q]);
  const groups = groupContacts(shown);
  const offCount = (list || []).filter((c) => !c.active).length;
  const amcOf = (id: string | null) => amc.find((a) => a.id === id);

  async function save() {
    if (!form) return;
    const err = contactError(form);
    if (err) { setError(err); return; }
    setBusy(true); setError("");
    const row = {
      category: form.category.trim(), name: form.name.trim(), contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null, alt_phone: form.alt_phone.trim() || null, notes: form.notes.trim() || null,
      sort_order: Number.isFinite(parseInt(form.sort_order, 10)) ? parseInt(form.sort_order, 10) : 100, amc_id: form.amc_id || null,
      updated_by: ctx.email, updated_at: new Date().toISOString(),
    };
    const { error } = form.id
      ? await supabase.from("society_contacts").update(row).eq("id", form.id)
      : await supabase.from("society_contacts").insert({ ...row, created_by: ctx.email });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setForm(null); await load();
  }
  async function setActive(c: Contact, active: boolean) {
    if (!active && !confirm(`Switch off "${c.name}"? Members will no longer see it. It is kept and can be switched on again.`)) return;
    const { error } = await supabase.from("society_contacts").update({ active, updated_by: ctx.email, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) setError(error.message); else await load();
  }
  function fromAmc(id: string) {
    const a = amcOf(id);
    setForm((f) => f && ({ ...f, amc_id: id, ...(a && !f.name ? { name: a.vendor } : {}), ...(a && !f.contact_person ? { contact_person: a.contact_person || "" } : {}), ...(a && !f.phone ? { phone: a.contact_phone || "" } : {}) }));
  }

  return (
    <div className="space-y-4 fade-in min-w-0">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 md:p-6">
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div className="min-w-0">
            <div className="serif text-[24px] font-bold">Important Contacts</div>
            <div className="mono text-[11px] opacity-60 mt-1">Lift, fire, security, MyGate, plumber and other services • tap a number to call</div>
          </div>
          {isCommittee && !missing && <button onClick={() => { setForm({ ...BLANK }); setError(""); }} className="btn-navy mono text-[12px] tracking-[0.08em] px-4 min-h-[44px]">+ ADD CONTACT</button>}
        </div>
        {missing && <div className="mt-4 border border-amber-200 bg-amber-50 text-amber-800 p-3 mono text-[11px]">The contacts list needs a one-time database step (CONTACTS.sql) to be run by the committee.</div>}
        {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
        {!missing && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <input className="field !w-full sm:!w-[280px]" placeholder="Search lift, plumber, a number…" value={q} onChange={(e) => setQ(e.target.value)} />
            {isCommittee && offCount > 0 && <label className="mono text-[11px] flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show switched-off ({offCount})</label>}
          </div>
        )}
      </div>

      {form && (
        <div className="bg-[var(--surface)] border-2 border-[var(--gold)] rounded-[4px] p-4 md:p-6 mono text-[11px] space-y-3">
          <div className="serif text-[18px] font-bold">{form.id ? "Edit contact" : "New contact"}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="min-w-0">CATEGORY *<input className="field mt-1" list="contact-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Lift" />
              <datalist id="contact-cats">{CONTACT_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="min-w-0">SERVICE / NAME *<input className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lift service company" /></label>
            <label className="min-w-0">CONTACT PERSON<input className="field mt-1" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></label>
            <label className="min-w-0">PHONE *<input className="field mt-1" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="min-w-0">ALTERNATE PHONE<input className="field mt-1" type="tel" inputMode="tel" value={form.alt_phone} onChange={(e) => setForm({ ...form, alt_phone: e.target.value })} /></label>
            <label className="min-w-0">ORDER (smaller shows first)<input className="field mt-1" inputMode="numeric" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value.replace(/[^\d-]/g, "") })} /></label>
            <label className="min-w-0 sm:col-span-2">NOTES (shown to members)<input className="field mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 24 hours • call for lift breakdown" /></label>
            {amc.length > 0 && <label className="min-w-0 sm:col-span-2">LINKED AMC CONTRACT (optional, committee only)
              <select className="field mt-1" value={form.amc_id} onChange={(e) => fromAmc(e.target.value)}>
                <option value="">— none —</option>
                {amc.map((a) => <option key={a.id} value={a.id}>{a.vendor} • {a.covers}{a.status === "closed" ? " (closed)" : ""}</option>)}
              </select></label>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={busy} className="btn-navy px-5 min-h-[44px] tracking-[0.08em]">{busy ? "SAVING…" : "SAVE"}</button>
            <button onClick={() => { setForm(null); setError(""); }} className="btn-line px-4 min-h-[44px]">CANCEL</button>
          </div>
        </div>
      )}

      {!missing && list && (groups.length === 0
        ? <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6 mono text-[11px] opacity-70">{q ? "No contact matches the search." : isCommittee ? "No contacts yet. Use + ADD CONTACT." : "No contacts have been added yet."}</div>
        : groups.map(([cat, items]) => (
          <div key={cat} className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 md:p-5 min-w-0">
            <div className="mono text-[11px] font-bold tracking-[0.16em]">{cat.toUpperCase()}</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {items.map((c) => { const a = isCommittee ? amcOf(c.amc_id) : undefined; return (
                <div key={c.id} className={`border p-3 rounded-[3px] min-w-0 ${c.active ? "border-[var(--border)] bg-[var(--bg)]" : "border-dashed border-gray-300 bg-gray-50 opacity-70"}`}>
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <div className="serif text-[16px] font-bold break-words">{c.name}</div>
                      {c.contact_person && <div className="mono text-[11px] opacity-75 break-words">{c.contact_person}</div>}
                    </div>
                    {!c.active && <span className="mono text-[9px] border border-gray-400 px-1.5 py-0.5 shrink-0">SWITCHED OFF</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2"><Phone n={c.phone} /><Phone n={c.alt_phone} /></div>
                  {c.notes && <div className="mono text-[11px] mt-2 opacity-75 break-words">{c.notes}</div>}
                  {a && <div className="mono text-[10px] mt-1 opacity-60 break-words">AMC: {a.covers} • till {a.end_date}</div>}
                  {isCommittee && <div className="mt-2 flex flex-wrap gap-3 mono text-[11px]">
                    <button onClick={() => { setForm(toForm(c)); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="underline min-h-[32px]">edit</button>
                    {c.active
                      ? <button onClick={() => setActive(c, false)} className="underline text-red-700 min-h-[32px]">switch off</button>
                      : <button onClick={() => setActive(c, true)} className="underline text-emerald-700 min-h-[32px]">switch on</button>}
                  </div>}
                </div>); })}
            </div>
          </div>)))}

      {areas.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 md:p-5">
          <WhoToContact flats={ctx.flats} isCommittee={isCommittee} areas={areas} />
        </div>
      )}
    </div>
  );
}
