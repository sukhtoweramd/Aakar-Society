"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, type Business } from "@/lib/society";
import type { Ctx } from "./ctx";

const EMPTY = { business_name: "", category: "", flat_id: "", mobile: "", description: "" };

export default function BusinessTab({ ctx }: { ctx: Ctx }) {
  const { flats } = ctx;
  const [list, setList] = useState<Business[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    const { data, error } = await supabase.from("businesses").select("*").order("business_name");
    if (error) setError(error.message); else setList((data as Business[]) || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!form.business_name.trim()) { setError("Enter the business name"); return; }
    setBusy(true); setError("");
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    const { error } = await supabase.from("businesses").insert([row]);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setForm(EMPTY); load();
  }
  async function remove(b: Business) {
    if (!confirm(`Remove "${b.business_name}"?`)) return;
    const { error } = await supabase.from("businesses").delete().eq("id", b.id);
    if (error) setError(error.message); else load();
  }

  const flatName = (id: string | null) => { const f = flats.find((x) => x.id === id); return f ? label(f) : id || "—"; };
  const s = q.trim().toLowerCase();
  const shown = list.filter((b) => !s || [b.business_name, b.category, b.description, flatName(b.flat_id)].some((v) => (v || "").toLowerCase().includes(s)));

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div>
            <div className="serif text-[24px] font-bold">Business Directory • Naranpura</div>
            <div className="mono text-[11px] opacity-60">Resident services within the society • {list.length} listed</div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="mono text-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 w-[220px] rounded-[2px] outline-none focus:border-[var(--gold)]" />
        </div>
        {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
        <div className="mt-6 grid md:grid-cols-3 gap-3">
          {shown.map((b) => (
            <div key={b.id} className="border border-[var(--border)] bg-[var(--bg)] p-4 relative">
              <button onClick={() => remove(b)} className="absolute top-2 right-2 mono text-[10px] text-red-600 opacity-60 hover:opacity-100">✕</button>
              <div className="mono text-[9px] tracking-[0.16em] bg-[var(--navy)] text-white inline-block px-2 py-0.5">{(b.category || "SERVICE").toUpperCase()}</div>
              <div className="serif text-[15px] font-bold mt-2 pr-4">{b.business_name}</div>
              <div className="mono text-[11px] mt-1 opacity-70">{flatName(b.flat_id)}{b.mobile ? ` • ${b.mobile}` : ""}</div>
              {b.description && <div className="mono text-[10px] mt-2 opacity-60">{b.description}</div>}
            </div>
          ))}
          {shown.length === 0 && <div className="md:col-span-3 border border-dashed border-[var(--border)] p-6 text-center mono text-[12px] opacity-60">{list.length ? "No match." : "No businesses listed yet. Add the first one below."}</div>}
        </div>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="mono text-[11px] font-bold tracking-[0.12em]">+ ADD BUSINESS</div>
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mono text-[11px]">
          <input className="field" placeholder="Business name *" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          <input className="field" placeholder="Category (e.g. Food, Tuition)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <select className="field" value={form.flat_id} onChange={(e) => setForm({ ...form, flat_id: e.target.value })}>
            <option value="">Flat (optional)</option>
            {flats.map((f) => <option key={f.id} value={f.id}>{label(f)}{f.owner_name ? ` • ${f.owner_name}` : ""}</option>)}
          </select>
          <input className="field" placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input className="field sm:col-span-2 lg:col-span-3" placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button onClick={add} disabled={busy} className="btn-navy px-4 py-2 tracking-[0.1em]">{busy ? "SAVING…" : "ADD"}</button>
        </div>
      </div>
    </div>
  );
}
