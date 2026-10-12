"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { floorOf, isOccupied, label, ownerText, rupees, statusText, unitOf, VAULT_SLOTS, type Flat, type StoredFile } from "@/lib/society";
import { deleteFile, fmtDate, fmtSize, listFiles, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";

type Member = { id: string; flat_id: string; name: string | null; relation: string | null; mobile: string | null; age: number | null; is_head: boolean | null };

export default function DetailTab({ ctx }: { ctx: Ctx }) {
  const { flats, categories, selectedId, selectFlat, go, reloadFlats } = ctx;
  const f = flats.find((x) => x.id === selectedId) || null;
  const [docs, setDocs] = useState<StoredFile[]>([]);
  const [vault, setVault] = useState<StoredFile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Flat>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newMember, setNewMember] = useState({ name: "", relation: "", mobile: "" });

  async function loadExtras(id: string) {
    setError("");
    listFiles(`flats/${id}`).then(setDocs).catch((e) => setError(e.message));
    listFiles("vault").then(setVault).catch(() => {});
    const { data } = await supabase.from("members").select("*").eq("flat_id", id);
    setMembers((data as Member[]) || []);
  }
  useEffect(() => { if (f) { loadExtras(f.id); setEditing(false); } }, [f?.id]);

  if (!f) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-10 text-center fade-in">
        <div className="h-12 w-12 mx-auto rounded-full border border-[var(--gold)] grid place-items-center serif text-[24px]">!</div>
        <div className="serif text-[22px] font-bold mt-4">No Flat Selected</div>
        <div className="mono text-[12px] opacity-60 mt-2 max-w-[320px] mx-auto">Select a flat from INDEX to view owner, maintenance, floor, tower, status, documents and family members.</div>
        <button onClick={() => go("INDEX")} className="btn-navy mt-6 mono text-[12px] tracking-[0.12em] px-6 py-3">Go to INDEX →</button>
      </div>
    );
  }

  const cat = categories.find((c) => c.ids.includes(f.id));
  const terrace = !!cat?.terrace;
  const hasSqft = "sqft" in f;
  const vaultDocs = VAULT_SLOTS.map((s) => ({ ...s, file: vault.find((v) => v.key.startsWith(`vault/${s.id}.`)) })).filter((s) => s.file);

  async function save() {
    setBusy("save"); setError("");
    const upd: any = {
      owner_name: form.owner_name?.trim() || null,
      email: form.email?.trim() || null,
      status: form.status || null,
      is_committee: !!form.is_committee,
      bhk: form.bhk?.trim() || null,
      maintenance: form.maintenance === null || form.maintenance === undefined || (form.maintenance as any) === "" ? null : Number(form.maintenance),
    };
    if (hasSqft) upd.sqft = form.sqft === null || form.sqft === undefined || (form.sqft as any) === "" ? null : Number(form.sqft);
    const { error } = await supabase.from("flats").update(upd).eq("id", f!.id);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setEditing(false);
    reloadFlats();
  }

  async function uploadDoc(file: File) {
    setBusy("doc"); setError("");
    try { await uploadFile(file, `flats/${f!.id}`); await loadExtras(f!.id); } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function removeDoc(d: StoredFile) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    try { await deleteFile({ key: d.key }); await loadExtras(f!.id); } catch (e: any) { setError(e.message); }
  }
  async function addMember() {
    if (!newMember.name.trim()) return;
    const { error } = await supabase.from("members").insert([{ flat_id: f!.id, name: newMember.name.trim(), relation: newMember.relation.trim() || null, mobile: newMember.mobile.trim() || null }]);
    if (error) { setError(error.message); return; }
    setNewMember({ name: "", relation: "", mobile: "" });
    loadExtras(f!.id);
  }
  async function removeMember(m: Member) {
    if (!confirm(`Remove ${m.name}?`)) return;
    const { error } = await supabase.from("members").delete().eq("id", m.id);
    if (error) setError(error.message); else loadExtras(f!.id);
  }

  const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-[var(--border)] p-4 bg-[var(--bg)]"><div className="mono text-[10px] opacity-60">{title}</div>{children}</div>
  );

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="mono text-[10px] tracking-[0.2em] opacity-60">FLAT DETAIL • SELECTED</div>
            <div className="serif text-[32px] font-bold mt-1">{label(f)} <span className="text-[var(--gold)]">• {f.id}</span></div>
            <div className="mono text-[11px] mt-1 opacity-70">Owner: {ownerText(f)} • Status: {statusText(f)} • Type: {f.bhk || "—"} • Tower {f.tower} • Floor {floorOf(f)}{f.is_committee ? " • ★ Committee" : ""}</div>
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            <button onClick={() => go("INDEX")} className="btn-line mono text-[11px] px-3 py-2">← BACK TO INDEX</button>
            <button onClick={() => go("FLOOR")} className="btn-navy mono text-[11px] px-3 py-2">VIEW FLOOR</button>
            <button onClick={() => { setForm({ ...f }); setEditing((v) => !v); }} className="btn-gold mono text-[11px] px-3 py-2">{editing ? "CANCEL EDIT" : "EDIT FLAT"}</button>
          </div>
        </div>
        {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}

        {editing && (
          <div className="mt-5 border border-[var(--gold)] bg-[#fffdf5] p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mono text-[11px]">
            <label className="sm:col-span-2">OWNER NAME<input className="field mt-1" value={form.owner_name || ""} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></label>
            <label className="sm:col-span-2">EMAIL<input className="field mt-1" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>STATUS
              <select className="field mt-1" value={form.status || ""} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="filled">filled (occupied)</option><option value="pending">pending</option>
              </select>
            </label>
            <label>BHK<input className="field mt-1" value={form.bhk || ""} onChange={(e) => setForm({ ...form, bhk: e.target.value })} /></label>
            <label>MAINTENANCE ₹<input className="field mt-1" type="number" value={form.maintenance ?? ""} onChange={(e) => setForm({ ...form, maintenance: e.target.value as any })} /></label>
            {hasSqft && <label>SQFT<input className="field mt-1" type="number" value={form.sqft ?? ""} onChange={(e) => setForm({ ...form, sqft: e.target.value as any })} /></label>}
            <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!form.is_committee} onChange={(e) => setForm({ ...form, is_committee: e.target.checked })} /> COMMITTEE MEMBER ★</label>
            <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
              <button onClick={save} disabled={busy === "save"} className="btn-navy px-5 py-2 text-[11px] tracking-[0.1em]">{busy === "save" ? "SAVING…" : "SAVE TO LEDGER"}</button>
              <button onClick={() => setEditing(false)} className="btn-line px-4 py-2 text-[11px]">CANCEL</button>
            </div>
          </div>
        )}

        <div className="mt-6 grid md:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Box title="OWNER">
                <div className={`serif text-[18px] font-bold mt-1 ${f.owner_name ? "" : "opacity-40"}`}>{ownerText(f)}</div>
                <div className="mono text-[10px] mt-2 opacity-60 break-all">{f.email ? `Email: ${f.email}` : "Email not recorded"}</div>
              </Box>
              <Box title="STATUS">
                <div className={`serif text-[18px] font-bold mt-1 ${isOccupied(f) ? "text-emerald-700" : "text-amber-600"}`}>{statusText(f)}</div>
                <div className="mono text-[11px] mt-2">{isOccupied(f) ? "Ledger active" : "Owner details pending"}</div>
              </Box>
              <Box title="MAINTENANCE">
                <div className="serif text-[22px] font-bold mt-1">{rupees(f.maintenance)}</div>
                <div className="mono text-[10px] mt-1 opacity-70">Per month • Due 5th</div>
                {cat && <div className="mono text-[9px] mt-1 opacity-50">Category: {cat.label} {rupees(cat.maint)}</div>}
              </Box>
              <Box title="BUILT-UP">
                <div className="serif text-[22px] font-bold mt-1">{f.sqft ? `${f.sqft} sqft` : "—"}</div>
                <div className="mono text-[10px] mt-1 opacity-70">{f.bhk || "—"} • {terrace ? "With Terrace - Owner" : "Standard"}</div>
              </Box>
            </div>

            <div className="border border-[var(--border)] p-4 bg-[var(--bg-soft)] mono text-[11px] leading-relaxed">
              <div className="font-bold">FLAT HISTORY</div>
              <div className="mt-2 opacity-80">
                {label(f)} is in Tower {f.tower}, Floor {floorOf(f)}. Registered under G-16551. {f.bhk ? `${f.bhk} layout. ` : ""}
                Maintenance {rupees(f.maintenance)} per month. {terrace ? "Terrace ownership applicable - owner holds exclusive terrace rights per agreement in VAULT." : "Terrace ownership not applicable for this floor."}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">TOWER</span><br /><span className="font-bold">Tower {f.tower}</span></div>
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">FLOOR</span><br /><span className="font-bold">Floor {floorOf(f)} • No {unitOf(f)}</span></div>
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">TYPE</span><br /><span className="font-bold">{f.bhk || "—"}</span></div>
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">CONTACT</span><br /><span className="font-bold break-all">{f.email || "Not on file"}</span></div>
              </div>
            </div>

            <div className="border border-[var(--border)] p-4 bg-[var(--surface)]">
              <div className="mono text-[10px] font-bold tracking-[0.14em]">FAMILY MEMBERS</div>
              {members.length === 0 && <div className="mono text-[11px] opacity-60 mt-2">No members recorded for this flat.</div>}
              <div className="mt-2 space-y-1">
                {members.map((m) => (
                  <div key={m.id} className="flex justify-between items-center mono text-[11px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5">
                    <span>{m.name}{m.relation ? ` • ${m.relation}` : ""}{m.mobile ? ` • ${m.mobile}` : ""}</span>
                    <button onClick={() => removeMember(m)} className="text-red-600 text-[10px]">✕</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_0.7fr_0.8fr_auto] gap-2 mono text-[11px]">
                <input className="field" placeholder="Name" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                <input className="field" placeholder="Relation" value={newMember.relation} onChange={(e) => setNewMember({ ...newMember, relation: e.target.value })} />
                <input className="field" placeholder="Mobile" value={newMember.mobile} onChange={(e) => setNewMember({ ...newMember, mobile: e.target.value })} />
                <button onClick={addMember} className="btn-navy px-3 py-2 text-[11px]">+ ADD</button>
              </div>
            </div>

            <div className="border border-amber-300 bg-[#fff8d6] p-4">
              <div className="flex flex-wrap justify-between gap-3 items-center">
                <div>
                  <div className="mono text-[10px] font-bold tracking-[0.14em]">FLAT DOCUMENTS • R2</div>
                  <div className="mono text-[11px] mt-1 opacity-70">Sale deed, share certificate, receipts for {label(f)}. Max 4 MB each.</div>
                </div>
                <label className="btn-navy mono text-[11px] px-4 py-2 cursor-pointer">
                  {busy === "doc" ? "UPLOADING…" : "UPLOAD DOCUMENT"}
                  <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" disabled={!!busy} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) uploadDoc(x); }} />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 mono text-[10px]">
                {f.r2_url && <a href={f.r2_url} target="_blank" rel="noopener noreferrer" className="border border-[var(--border)] bg-white p-2 flex justify-between items-center hover:border-[var(--gold)]"><span className="truncate">Earlier document</span><span>↗</span></a>}
                {docs.map((d) => (
                  <div key={d.key} className="border border-[var(--border)] bg-white p-2 flex justify-between items-center gap-2 hover:border-[var(--gold)]">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">{d.name}</a>
                    <span className="flex items-center gap-2 shrink-0"><span className="opacity-50">{fmtDate(d.uploaded)} • {fmtSize(d.size)}</span><button onClick={() => removeDoc(d)} className="text-red-600">✕</button></span>
                  </div>
                ))}
                {!f.r2_url && docs.length === 0 && <div className="opacity-60">No documents uploaded for this flat yet.</div>}
              </div>
            </div>
          </div>

          <div className="border border-[var(--border)] rounded-[3px] overflow-hidden self-start">
            <div className="bg-[var(--navy)] text-white mono text-[10px] tracking-[0.16em] p-3">OTHER FLATS • TOWER {f.tower}</div>
            <div className="divide-y divide-[var(--border)] max-h-[380px] overflow-auto">
              {flats.filter((m) => m.tower === f.tower).map((m) => (
                <button key={m.id} onClick={() => selectFlat(m.id)} className={`w-full text-left p-3 flex justify-between gap-2 mono text-[11px] hover:bg-[var(--bg)] ${m.id === f.id ? "bg-amber-50" : "bg-[var(--surface)]"}`}>
                  <span className="truncate">{label(m)} • {m.owner_name || "—"}</span><span className="opacity-60 shrink-0">{rupees(m.maintenance)}</span>
                </button>
              ))}
            </div>
            <div className="p-3 bg-[var(--bg-soft)] border-t border-[var(--border)] mono text-[10px]">
              <div className="font-bold tracking-[0.12em]">QUICK ACTIONS</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => go("VAULT")} className="btn-navy px-2 py-1">OPEN VAULT 🔒</button>
                <button onClick={() => go("ADMIN")} className="btn-line px-2 py-1">CHARGES</button>
                <button onClick={() => go("BUSINESS")} className="btn-line px-2 py-1">BUSINESS</button>
              </div>
              <div className="mt-3 space-y-1">
                {vaultDocs.slice(0, 3).map((s) => (
                  <a key={s.id} href={s.file!.url} target="_blank" rel="noopener noreferrer" className="flex justify-between border border-[var(--border)] bg-white p-2 hover:border-[var(--gold)]"><span className="truncate">{s.name}</span><span>↗</span></a>
                ))}
                {vaultDocs.length === 0 && <div className="opacity-50">No vault documents uploaded yet.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
