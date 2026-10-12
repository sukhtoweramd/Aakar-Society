"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Member = {
  id: string; flat_id: string; name: string | null; relation: string | null; mobile: string | null; age: number | null; is_head: boolean | null;
  email?: string | null; occupation?: string | null; business_name?: string | null; business_category?: string | null; office_address?: string | null; office_phone?: string | null;
};

const BLANK = { name: "", relation: "", mobile: "", email: "", age: "", is_head: false, occupation: "", business_name: "", business_category: "", office_address: "", office_phone: "" };
type Form = typeof BLANK;
const CATEGORIES = ["Medical", "Legal", "Finance / CA", "IT / Software", "Engineering", "Education", "Retail / Shop", "Food", "Real Estate", "Manufacturing", "Government", "Service / Job", "Home Business", "Other"];

const toForm = (m: Member): Form => ({
  name: m.name || "", relation: m.relation || "", mobile: m.mobile || "", email: m.email || "", age: m.age?.toString() || "", is_head: !!m.is_head,
  occupation: m.occupation || "", business_name: m.business_name || "", business_category: m.business_category || "", office_address: m.office_address || "", office_phone: m.office_phone || "",
});
const toRow = (f: Form) => ({
  name: f.name.trim(), relation: f.relation.trim() || null, mobile: f.mobile.trim() || null, email: f.email.trim() || null,
  age: f.age === "" ? null : parseInt(f.age, 10) || null, is_head: f.is_head,
  occupation: f.occupation.trim() || null, business_name: f.business_name.trim() || null, business_category: f.business_category || null,
  office_address: f.office_address.trim() || null, office_phone: f.office_phone.trim() || null,
});

export default function MembersPanel({ flatId }: { flatId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("members").select("*").eq("flat_id", flatId);
    if (error) setError(error.message);
    setMembers(((data as Member[]) || []).sort((a, b) => Number(!!b.is_head) - Number(!!a.is_head) || (a.name || "").localeCompare(b.name || "")));
  }
  useEffect(() => { load(); setEditId(null); }, [flatId]);

  async function save() {
    if (!form.name.trim()) { setError("Enter the member's name"); return; }
    setBusy(true); setError("");
    const row = toRow(form);
    const res = editId === "new"
      ? await supabase.from("members").insert([{ ...row, flat_id: flatId }])
      : await supabase.from("members").update(row).eq("id", editId!);
    setBusy(false);
    if (res.error) {
      setError(/column/i.test(res.error.message) ? `${res.error.message} — the database step for member professions hasn't been run yet.` : res.error.message);
      return;
    }
    setEditId(null); load();
  }
  async function remove(m: Member) {
    if (!confirm(`Remove ${m.name}?`)) return;
    const { error } = await supabase.from("members").delete().eq("id", m.id);
    if (error) setError(error.message); else load();
  }

  const set = (k: keyof Form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const editor = (
    <div className="border border-[var(--gold)] bg-[#fffdf5] p-3 mono text-[11px] space-y-3">
      <div>
        <div className="text-[10px] tracking-[0.14em] opacity-60 mb-1">PERSONAL</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <input className="field" placeholder="Full name *" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <input className="field" placeholder="Relation (Self, Wife, Son…)" value={form.relation} onChange={(e) => set("relation", e.target.value)} />
          <input className="field" type="number" placeholder="Age" value={form.age} onChange={(e) => set("age", e.target.value)} />
          <input className="field" placeholder="Mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
          <input className="field" type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <label className="flex items-center gap-2 px-1"><input type="checkbox" checked={form.is_head} onChange={(e) => set("is_head", e.target.checked)} /> Head of family</label>
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
        <div className="mono text-[10px] font-bold tracking-[0.14em]">FAMILY MEMBERS • {members.length}</div>
        {editId === null && <button onClick={() => { setForm(BLANK); setEditId("new"); }} className="btn-navy mono text-[11px] px-3 py-1.5">+ ADD MEMBER</button>}
      </div>
      {error && <div className="mt-2 border border-red-200 bg-red-50 text-red-700 p-2 mono text-[11px]">{error}</div>}
      {editId === "new" && <div className="mt-3">{editor}</div>}
      {members.length === 0 && editId !== "new" && <div className="mono text-[11px] opacity-60 mt-2">No members recorded for this flat.</div>}
      <div className="mt-3 space-y-2">
        {members.map((m) => editId === m.id ? <div key={m.id}>{editor}</div> : (
          <div key={m.id} className="border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="serif text-[14px] font-bold">{m.name}{m.is_head && <span className="mono text-[9px] ml-2 bg-[var(--navy)] text-white px-1.5 py-0.5 align-middle">HEAD</span>}</div>
                <div className="mono text-[10px] opacity-70">{[m.relation, m.age ? `${m.age} yrs` : null, m.mobile, m.email].filter(Boolean).join(" • ") || "—"}</div>
                {(m.occupation || m.business_name) && (
                  <div className="mono text-[10px] mt-1.5 border-l-2 border-[var(--gold)] pl-2">
                    <span className="font-semibold">{[m.occupation, m.business_name].filter(Boolean).join(" • ")}</span>
                    {m.business_category && <span className="opacity-60"> • {m.business_category}</span>}
                    {(m.office_address || m.office_phone) && <div className="opacity-70">{[m.office_address, m.office_phone].filter(Boolean).join(" • ")}</div>}
                  </div>
                )}
              </div>
              <div className="flex gap-3 shrink-0 mono text-[10px]">
                <button onClick={() => { setForm(toForm(m)); setEditId(m.id); }} className="underline">Edit</button>
                <button onClick={() => remove(m)} className="text-red-600">✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
