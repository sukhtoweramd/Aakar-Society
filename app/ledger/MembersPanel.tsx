"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ageFromDob, ageOf, birthdayText, fullDob, validDob } from "@/lib/dob";
import { byFamilyOrder, committeePeople, COMMITTEE_ROLES, topRole, type CommitteePerson, type Flat } from "@/lib/society";

export type Member = {
  id: string; flat_id: string; name: string | null; relation: string | null; mobile: string | null; age: number | null; dob?: string | null; is_head: boolean | null;
  email?: string | null; occupation?: string | null; business_name?: string | null; business_category?: string | null; office_address?: string | null; office_phone?: string | null;
};

const BLANK = { name: "", relation: "", mobile: "", email: "", age: "", dob: "", is_head: false, occupation: "", business_name: "", business_category: "", office_address: "", office_phone: "" };
type Form = typeof BLANK;
const CATEGORIES = ["Medical", "Legal", "Finance / CA", "IT / Software", "Engineering", "Education", "Retail / Shop", "Food", "Real Estate", "Manufacturing", "Government", "Service / Job", "Home Business", "Other"];

const toForm = (m: Member): Form => ({
  name: m.name || "", relation: m.relation || "", mobile: m.mobile || "", email: m.email || "", age: m.age?.toString() || "", dob: m.dob || "", is_head: !!m.is_head,
  occupation: m.occupation || "", business_name: m.business_name || "", business_category: m.business_category || "", office_address: m.office_address || "", office_phone: m.office_phone || "",
});
const toRow = (f: Form) => ({
  name: f.name.trim(), relation: f.relation.trim() || null, mobile: f.mobile.trim() || null, email: f.email.trim() || null,
  // a date of birth replaces the age (the app works the age out); without one the old typed age stays as it was
  dob: f.dob || null, age: f.dob ? null : f.age === "" ? null : parseInt(f.age, 10) || null, is_head: f.is_head,
  occupation: f.occupation.trim() || null, business_name: f.business_name.trim() || null, business_category: f.business_category || null,
  office_address: f.office_address.trim() || null, office_phone: f.office_phone.trim() || null,
});

export default function MembersPanel({ flatId, ownerName, ownerEmail, tenant = false, lockHead = false, committeeFlat, canSetCommittee = false, onFlatChanged, readOnly = false }:
  { flatId: string; ownerName?: string | null; ownerEmail?: string | null; tenant?: boolean; lockHead?: boolean; committeeFlat?: Flat; canSetCommittee?: boolean; onFlatChanged?: () => void; readOnly?: boolean }) {
  // Committee member of the society (COMMITTEE_PERSON.sql): the flag and designation are the flat's; this marks which
  // family member holds it. Only committee logins can change it.
  const cf = committeeFlat;
  const people: CommitteePerson[] = cf ? committeePeople(cf) : [];
  const key = (n?: string | null) => (n || "").trim().toLowerCase();
  const roleOf = (name?: string | null) => people.find((p) => key(p.name) === key(name))?.role || "";
  const isCp = (name?: string | null) => !!roleOf(name);
  const [com, setCom] = useState<{ on: boolean; role: string }>({ on: false, role: "Committee Member" });
  const who = tenant ? "Tenant" : "Owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("members").select("*").eq("flat_id", flatId);
    if (error) setError(error.message);
    setMembers(((data as Member[]) || []).sort(byFamilyOrder));
  }
  useEffect(() => { load(); setEditId(null); }, [flatId]);

  // Several family members may be on the committee, each with a designation (COMMITTEE_PEOPLE.sql).
  async function saveCommittee(name: string, oldName: string | null) {
    if (!cf || !canSetCommittee) return null;
    if (!("committee_members" in cf)) {   // older database (only COMMITTEE_PERSON.sql run): one person per flat
      if (!("committee_person" in cf)) return null;
      const upd = com.on ? { is_committee: true, committee_role: com.role.trim() || "Committee Member", committee_person: name.trim() } : { committee_person: null };
      return (await supabase.from("flats").update(upd).eq("id", cf.id)).error;
    }
    let list = people.filter((p) => key(p.name) !== key(name) && key(p.name) !== key(oldName) && p.name !== "Owner not recorded");
    if (com.on) list = [...list, { name: name.trim(), role: com.role.trim() || "Committee Member" }];
    const upd: any = { committee_members: list, committee_person: list[0]?.name || null };
    if (list.length) { upd.is_committee = true; upd.committee_role = topRole(list); }
    return (await supabase.from("flats").update(upd).eq("id", cf.id)).error;
  }
  async function save() {
    if (!form.name.trim()) { setError("Enter the member's name"); return; }
    if (form.dob && !validDob(form.dob)) { setError("Check the date of birth: it must be a real date, not in the future."); return; }
    setBusy(true); setError("");
    const row: any = toRow(form);
    // no date of birth anywhere: leave the column out, so saving still works before DOB.sql has been run
    if (!form.dob && !(editId !== "new" && members.find((m) => m.id === editId)?.dob)) delete row.dob;
    const res = editId === "new"
      ? await supabase.from("members").insert([{ ...row, flat_id: flatId }])
      : await supabase.from("members").update(row).eq("id", editId!);
    if (!res.error && row.is_head) {
      // only one head of family per flat
      const others = members.filter((m) => m.is_head && m.id !== editId).map((m) => m.id);
      if (others.length) await supabase.from("members").update({ is_head: false }).in("id", others);
    }
    setBusy(false);
    if (res.error) {
      setError(/column/i.test(res.error.message) ? `${res.error.message} — the database step for member professions hasn't been run yet.` : res.error.message);
      return;
    }
    const oldName = editId !== "new" ? members.find((m) => m.id === editId)?.name || null : null;
    const wasCp = isCp(oldName);
    if (canSetCommittee && (com.on || wasCp)) {
      const e = await saveCommittee(form.name, oldName);
      if (e) { setError(e.message); return; }
      onFlatChanged?.();
    }
    setEditId(null); load();
  }
  async function remove(m: Member) {
    if (!confirm(`Remove ${m.name}?`)) return;
    const { error } = await supabase.from("members").delete().eq("id", m.id);
    if (error) setError(error.message); else load();
  }

  const set = (k: keyof Form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  // Head of family (sql-security/06, 27 Oct 2026): for a flat login, once the head's name is filled in only the
  // committee can change it, remove the head or make someone else head. Other family members stay editable.
  const head = members.find((m) => m.is_head);
  const headLocked = (m?: Member | null) => lockHead && !!m?.is_head && !!(m.name || "").trim();
  const editingHead = editId !== "new" && headLocked(members.find((m) => m.id === editId));
  const headBoxLocked = lockHead && (editingHead || (!!head && head.id !== editId));
  // "BHUPESH D MEHTA & HINA B MEHTA" -> first owner "BHUPESH D MEHTA"
  const firstOwner = (ownerName || "").split(/\s*(?:&|,|\band\b)\s*/i)[0].trim();
  const ownerMissing = !!firstOwner && !members.some((m) => m.is_head || (m.name || "").trim().toLowerCase() === firstOwner.toLowerCase());
  const editor = (
    <div className="border border-[var(--gold)] bg-[#fffdf5] p-3 mono text-[11px] space-y-3">
      <div>
        <div className="text-[10px] tracking-[0.14em] opacity-60 mb-1">PERSONAL</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <input className="field" placeholder="Full name *" disabled={editingHead} title={editingHead ? "Only the committee can change the head of family's name" : undefined} value={form.name} onChange={(e) => set("name", e.target.value)} />
          <input className="field" placeholder="Relation (Self, Wife, Son…)" value={form.relation} onChange={(e) => set("relation", e.target.value)} />
          <label className="block"><span className="text-[10px] opacity-60">DATE OF BIRTH (optional)</span>
            <input className="field mt-0.5" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            {form.dob ? <span className="block mt-0.5 opacity-80">Age {ageFromDob(form.dob) ?? "—"}. <b>Birthday ({birthdayText(form.dob) || "—"}, not the year) will be shown to all members and on the birthday banner.</b> Clear the date if you do not want to share.</span>
              : <span className="block mt-0.5 opacity-70">{form.age ? `Old age on record: ${form.age}. ` : ""}Entering a date of birth means you agree to share the birthday (day and month only) with all members. Leave empty if you do not want to share.</span>}</label>
          <input className="field" placeholder="Mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
          <input className="field" type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <label className="flex items-center gap-2 px-1"><input type="checkbox" disabled={headBoxLocked} checked={form.is_head} onChange={(e) => set("is_head", e.target.checked)} /> Head of family / {who}</label>
          {canSetCommittee && cf && ("committee_members" in cf || "committee_person" in cf) && <div className="sm:col-span-2 lg:col-span-3 border border-[var(--gold)] bg-white p-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={com.on} onChange={(e) => setCom({ ...com, on: e.target.checked })} /> ★ On the society committee</label>
            {com.on && <select className="field !w-auto" value={COMMITTEE_ROLES.includes(com.role) ? com.role : "Committee Member"} onChange={(e) => setCom({ ...com, role: e.target.value })}>
              {COMMITTEE_ROLES.map((r) => <option key={r}>{r}</option>)}</select>}
            <span className="opacity-60 text-[10px] w-full">Each family member on the committee gets their own designation (two in one family is fine). To take the whole flat off the committee, use EDIT FLAT.</span>
          </div>}
          {headBoxLocked && <div className="sm:col-span-2 lg:col-span-3 px-1 opacity-70">The head of family{editingHead ? "'s name" : ""} can be changed only by the committee.</div>}
        </div>
      </div>
      <div>
        <div className="text-[10px] tracking-[0.14em] opacity-60 mb-1">PROFESSION / BUSINESS • shown in the society Business Directory</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <input className="field" placeholder="Profession (Doctor, CA, Service…)" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
          <input className="field" placeholder="Business / firm / employer" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
          <select className="field" value={form.business_category} onChange={(e) => set("business_category", e.target.value)}>
            <option value="">Category</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="field sm:col-span-2" placeholder="Office address" value={form.office_address} onChange={(e) => set("office_address", e.target.value)} />
          <input className="field" placeholder="Office phone" value={form.office_phone} onChange={(e) => set("office_phone", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-navy px-5 py-2 tracking-[0.1em]">{busy ? "SAVING…" : "SAVE MEMBER"}</button>
        <button onClick={() => setEditId(null)} className="btn-line px-4 py-2">CANCEL</button>
      </div>
    </div>
  );

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--surface)]">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="mono text-[10px] font-bold tracking-[0.14em]">{tenant ? "TENANT'S FAMILY" : "FAMILY MEMBERS"} • {members.length}</div>
        {editId === null && !readOnly && <button onClick={() => { setForm(BLANK); setEditId("new"); setCom({ on: false, role: "Committee Member" }); }} className="btn-navy mono text-[11px] px-3 py-1.5">+ ADD MEMBER</button>}
      </div>
      {error && <div className="mt-2 border border-red-200 bg-red-50 text-red-700 p-2 mono text-[11px]">{error}</div>}
      {ownerMissing && editId === null && (
        <div className="mt-3 border border-amber-300 bg-[#fff8d6] p-3 mono text-[11px] flex flex-wrap gap-3 items-center justify-between">
          <span>{who} <b>{firstOwner}</b> is not in the family list yet. Add them so their profession and mobile show in reports and the directories.</span>
          {!readOnly && <button onClick={() => { setForm({ ...BLANK, name: firstOwner, relation: "Self", is_head: true, email: ownerEmail || "" }); setEditId("new"); setCom({ on: false, role: "Committee Member" }); }} className="btn-navy px-3 py-1.5 shrink-0">+ ADD {who.toUpperCase()} AS FAMILY MEMBER</button>}
        </div>
      )}
      {editId === "new" && <div className="mt-3">{editor}</div>}
      {members.length === 0 && editId !== "new" && <div className="mono text-[11px] opacity-60 mt-2">No members recorded for this flat.</div>}
      <div className="mt-3 space-y-2">
        {members.map((m) => editId === m.id ? <div key={m.id}>{editor}</div> : (
          <div key={m.id} className="border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="serif text-[14px] font-bold">{m.name}{m.is_head && <span className="mono text-[9px] ml-2 bg-[var(--navy)] text-white px-1.5 py-0.5 align-middle">HEAD</span>}{isCp(m.name) && <span className="mono text-[9px] ml-2 bg-[var(--gold)] text-black px-1.5 py-0.5 align-middle">★ {roleOf(m.name)}</span>}</div>
                <div className="mono text-[10px] opacity-70">{[m.relation, ageOf(m) != null ? `${ageOf(m)} yrs` : null, m.dob ? `🎂 ${fullDob(m.dob)}` : null, m.mobile, m.email].filter(Boolean).join(" • ") || "—"}</div>
                {(m.occupation || m.business_name) && (
                  <div className="mono text-[10px] mt-1.5 border-l-2 border-[var(--gold)] pl-2">
                    <span className="font-semibold">{[m.occupation, m.business_name].filter(Boolean).join(" • ")}</span>
                    {m.business_category && <span className="opacity-60"> • {m.business_category}</span>}
                    {(m.office_address || m.office_phone) && <div className="opacity-70">{[m.office_address, m.office_phone].filter(Boolean).join(" • ")}</div>}
                  </div>
                )}
              </div>
              <div className="flex gap-3 shrink-0 mono text-[10px]">
                {!readOnly && <button onClick={() => { setForm(toForm(m)); setEditId(m.id); setCom({ on: isCp(m.name), role: roleOf(m.name) || "Committee Member" }); }} className="underline">Edit</button>}
                {!headLocked(m) && !readOnly && <button onClick={() => remove(m)} className="text-red-600">✕</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
