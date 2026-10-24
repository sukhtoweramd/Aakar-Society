"use client";
import { useEffect, useState } from "react";
import { VAULT_SLOTS, type StoredFile } from "@/lib/society";
import { deleteFile, fmtDate, fmtSize, listFiles, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";
import { FileLink } from "./SecureFile";

export default function VaultTab({ ctx }: { ctx: Ctx }) {
  const canEdit = ctx.isCommittee;
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try { setFiles(await listFiles("vault")); } catch (e: any) { setError(e.message); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function upload(file: File, slot?: string) {
    setBusy(slot || "other"); setError("");
    try {
      // replacing a slot: remove the old file if it had a different extension
      if (slot) for (const old of files.filter((x) => x.key.startsWith(`vault/${slot}.`))) await deleteFile({ key: old.key });
      await uploadFile(file, "vault", slot);
      await load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function remove(f: StoredFile) {
    if (!confirm(`Delete "${f.name}" from the vault?`)) return;
    try { await deleteFile({ key: f.key }); await load(); } catch (e: any) { setError(e.message); }
  }

  const slotFile = (id: string) => files.find((f) => f.key.startsWith(`vault/${id}.`));
  const others = files.filter((f) => !VAULT_SLOTS.some((s) => f.key.startsWith(`vault/${s.id}.`)));
  const filled = VAULT_SLOTS.filter((s) => slotFile(s.id)).length;

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--navy)] text-[#fdfcf5] border border-[var(--navy)] rounded-[4px] p-5 flex flex-wrap justify-between gap-4">
        <div>
          <div className="serif text-[22px] font-bold tracking-wide">SOCIETY DOCUMENT VAULT</div>
          <div className="mono text-[11px] mt-1 opacity-80">{filled} of {VAULT_SLOTS.length} official documents uploaded • {others.length} other files • Stored permanently in R2</div>
        </div>
        <div className="mono text-[10px] border border-white/20 p-2 bg-white/5 self-start">
          <div>Bucket: aakar-vault/vault</div>
          <div className="text-[var(--gold)]">{canEdit ? "Committee can upload" : "View only"}</div>
        </div>
      </div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
      <div className="grid md:grid-cols-2 gap-3">
        {VAULT_SLOTS.map((s) => {
          const f = slotFile(s.id);
          return (
            <div key={s.id} className={`border rounded-[4px] p-4 ${s.important ? "border-amber-400 bg-[#fff8d6]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="serif text-[15px] font-bold">{s.name}</div>
                    {s.important && <span className="mono text-[8px] bg-amber-400 text-black px-1.5 py-0.5">IMPORTANT</span>}
                  </div>
                  <div className="mono text-[10px] opacity-60 mt-1 break-all">{f ? `${f.key} • ${fmtSize(f.size)}` : loaded ? "Not uploaded yet" : "Checking…"}</div>
                  {f?.uploaded && <div className="mono text-[9px] mt-1 text-emerald-700">Uploaded {fmtDate(f.uploaded)}</div>}
                </div>
                <div className="h-8 w-8 border border-[var(--border)] grid place-items-center mono text-[10px] shrink-0">{f ? (f.key.split(".").pop() || "").toUpperCase() : "—"}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                {f ? <FileLink file={f.key} className="btn-navy mono text-[11px] px-3 py-1.5 inline-block">VIEW</FileLink>
                   : <span className="mono text-[11px] px-3 py-1.5 border border-dashed border-[var(--border)] opacity-60">NO FILE</span>}
                {canEdit && <label className="btn-gold mono text-[11px] px-3 py-1.5 inline-flex items-center gap-2">
                  {busy === s.id ? "UPLOADING…" : f ? "REPLACE" : "UPLOAD"}
                  <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx" disabled={!!busy} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) upload(x, s.id); }} />
                </label>}
                {canEdit && f && <button onClick={() => remove(f)} className="mono text-[10px] text-red-600 ml-auto">DELETE</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="mono text-[11px] font-bold tracking-[0.12em]">OTHER SOCIETY DOCUMENTS</div>
          {canEdit && <label className="btn-navy mono text-[11px] px-3 py-1.5 cursor-pointer">
            {busy === "other" ? "UPLOADING…" : "+ UPLOAD DOCUMENT"}
            <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" disabled={!!busy} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) upload(x); }} />
          </label>}
        </div>
        <div className="mt-3 space-y-1">
          {others.map((f) => (
            <div key={f.key} className="flex justify-between items-center gap-2 mono text-[11px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
              <FileLink file={f.key} className="truncate hover:underline">{f.name}</FileLink>
              <span className="flex gap-3 items-center shrink-0"><span className="opacity-50 text-[10px]">{fmtDate(f.uploaded)} • {fmtSize(f.size)}</span>{canEdit && <button onClick={() => remove(f)} className="text-red-600 text-[10px]">✕</button>}</span>
            </div>
          ))}
          {loaded && others.length === 0 && <div className="mono text-[11px] opacity-60">No other documents yet (AGM minutes, audit reports, etc.).</div>}
        </div>
        <div className="mono text-[10px] opacity-50 mt-3">Max 4 MB per file • PDF, JPG, PNG, DOCX, XLSX</div>
      </div>
    </div>
  );
}
