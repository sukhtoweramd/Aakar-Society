"use client";
// A small add / edit / remove list stored per flat (vehicles, emergency contacts).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Field = {
  key: string; label: string; placeholder?: string; required?: boolean;
  options?: string[]; upper?: boolean; width?: string;
};
type Row = Record<string, any> & { id: string };

export const VEHICLE_TYPES = ["Cycle", "2-wheeler", "4-wheeler compact", "4-wheeler SUV", "Others"];
// "gj01ab1234" / "GJ-01-AB-1234" -> "GJ 01 AB 1234"
export const fmtPlate = (s: string) => {
  const t = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = t.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  return m ? [m[1], m[2].padStart(2, "0"), m[3], m[4]].filter(Boolean).join(" ") : s.toUpperCase().trim();
};

export default function FlatListPanel({ table, flatId, title, note, fields, addLabel, render, empty }: {
  table: string; flatId: string; title: string; note?: string; fields: Field[]; addLabel: string;
  render: (r: Row) => React.ReactNode; empty: string;
}) {
  const blank = Object.fromEntries(fields.map((f) => [f.key, f.options ? f.options[0] : ""]));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.from(table).select("*").eq("flat_id", flatId).order("created_at");
    if (error) {
      if (/does not exist|could not find the table|schema cache/i.test(error.message)) setMissing(true); else setError(error.message);
      setRows([]); return;
    }
    setRows((data as Row[]) || []);
  }
  useEffect(() => { load(); setEditId(null); }, [flatId]);

  async function save() {
    const miss = fields.find((f) => f.required && !String(form[f.key] || "").trim());
    if (miss) { setError(`Enter ${miss.label.toLowerCase()}`); return; }
    const row: Record<string, any> = {};
    for (const f of fields) {
      let v = String(form[f.key] ?? "").trim();
      if (f.key === "plate" && v) v = fmtPlate(v); else if (f.upper) v = v.toUpperCase();
      row[f.key] = v || null;
    }
    setBusy(true); setError("");
    const res = editId === "new"
      ? await supabase.from(table).insert([{ ...row, flat_id: flatId }])
      : await supabase.from(table).update(row).eq("id", editId!);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setEditId(null); load();
  }
  async function remove(r: Row) {
    if (!confirm("Remove this entry?")) return;
    const { error } = await supabase.from(table).delete().eq("id", r.id);
    if (error) setError(error.message); else load();
  }

  if (missing) return <div className="border border-dashed border-[var(--border)] p-4 mono text-[11px] opacity-70">{title}: available once the committee completes a one-time database step.</div>;

  const editor = (
    <div className="border border-[var(--gold)] bg-[#fffdf5] p-3 mono text-[11px] space-y-2">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {fields.map((f) => f.options ? (
          <label key={f.key} className="text-[10px] opacity-80">{f.label.toUpperCase()}{f.required ? " *" : ""}
            <select className="field mt-1" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
              {f.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        ) : (
          <label key={f.key} className="text-[10px] opacity-80">{f.label.toUpperCase()}{f.required ? " *" : ""}
            <input className={`field mt-1 ${f.key === "plate" ? "uppercase" : ""}`} placeholder={f.placeholder} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-navy px-5 py-2 tracking-[0.1em]">{busy ? "SAVING…" : "SAVE"}</button>
        <button onClick={() => { setEditId(null); setError(""); }} className="btn-line px-4 py-2">CANCEL</button>
      </div>
    </div>
  );

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--surface)]">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div>
          <div className="mono text-[10px] font-bold tracking-[0.14em]">{title} • {rows?.length ?? 0}</div>
          {note && <div className="mono text-[10px] opacity-60 mt-0.5">{note}</div>}
        </div>
        {editId === null && <button onClick={() => { setForm(blank); setEditId("new"); setError(""); }} className="btn-navy mono text-[11px] px-3 py-1.5">{addLabel}</button>}
      </div>
      {error && <div className="mt-2 border border-red-200 bg-red-50 text-red-700 p-2 mono text-[11px]">{error}</div>}
      {editId === "new" && <div className="mt-3">{editor}</div>}
      {rows && rows.length === 0 && editId !== "new" && <div className="mono text-[11px] opacity-60 mt-2">{empty}</div>}
      <div className="mt-3 space-y-2">
        {(rows || []).map((r) => editId === r.id ? <div key={r.id}>{editor}</div> : (
          <div key={r.id} className="border border-[var(--border)] bg-[var(--bg)] p-3 flex justify-between items-start gap-2">
            <div className="min-w-0">{render(r)}</div>
            <div className="flex gap-3 shrink-0 mono text-[10px]">
              <button onClick={() => { setForm(Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? ""]))); setEditId(r.id); setError(""); }} className="underline">Edit</button>
              <button onClick={() => remove(r)} className="text-red-600">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
