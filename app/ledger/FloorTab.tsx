"use client";
import { useEffect, useState } from "react";
import { rupees, type StoredFile } from "@/lib/society";
import { deleteFile, fmtDate, fmtSize, listFiles, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";

export default function FloorTab({ ctx }: { ctx: Ctx }) {
  const { categories, flats } = ctx;
  const towers = Array.from(new Set(categories.map((c) => c.tower)));
  const [plans, setPlans] = useState<Record<string, StoredFile[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const entries = await Promise.all(towers.map(async (t) => [t, await listFiles(`floor-plans/${t}`)] as const));
      setPlans(Object.fromEntries(entries));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { if (towers.length) load(); }, [towers.join()]);

  async function upload(t: string, file: File) {
    setBusy(t); setError("");
    try { await uploadFile(file, `floor-plans/${t}`); await load(); } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function remove(f: StoredFile) {
    if (!confirm(`Delete plan "${f.name}"?`)) return;
    try { await deleteFile({ key: f.key }); await load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div>
            <div className="serif text-[24px] font-bold">Floor Plans • Sukh Tower</div>
            <div className="mono text-[11px] opacity-60 mt-1">Architectural drawings • Terrace logic annotated • Stored permanently in R2 (aakar-vault/floor-plans)</div>
          </div>
          {ctx.isCommittee
            ? <div className="mono text-[10px] px-3 py-2 border rounded-[3px] bg-emerald-50 border-emerald-200 text-emerald-800">● COMMITTEE • You can upload floor plans</div>
            : <div className="mono text-[10px] px-3 py-2 border rounded-[3px] bg-amber-50 border-amber-200 text-amber-800">● VIEW ONLY</div>}
        </div>
        {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {towers.map((t) => {
            const cats = categories.filter((c) => c.tower === t);
            const std = cats.find((c) => !c.terrace), ter = cats.find((c) => c.terrace);
            const files = plans[t] || [];
            const latest = files[0];
            return (
              <div key={t} className="border border-[var(--border)] bg-[var(--bg)] p-4 rounded-[3px] flex flex-col">
                <div className="flex justify-between items-center">
                  <div className="mono text-[11px] font-bold tracking-[0.16em]">TOWER {t}</div>
                  <span className="mono text-[9px] border border-[var(--border)] bg-white px-1.5 py-0.5">{flats.filter((f) => f.tower === t).length} FLATS</span>
                </div>
                <div className="mt-3 border border-dashed border-[var(--border)] h-[180px] bg-[var(--surface)] rounded-[3px] relative overflow-hidden">
                  {latest ? (
                    <div className="h-full w-full p-3 flex flex-col">
                      <div className="flex-1 border border-[var(--border)] bg-white grid place-items-center mono text-[10px]">
                        <div className="text-center px-3">
                          <div className="h-10 w-10 mx-auto border border-[var(--gold)] rounded-full grid place-items-center serif text-[18px] mb-2">⌖</div>
                          <div className="font-bold tracking-[0.08em]">PLAN READY</div>
                          <div className="opacity-60 mt-1 break-all">{latest.name}</div>
                          <div className="opacity-50 mt-1 text-[9px]">R2 • {fmtDate(latest.uploaded)} • {fmtSize(latest.size)}</div>
                        </div>
                      </div>
                      <a href={latest.url} target="_blank" rel="noopener noreferrer" className="mt-2 mono text-[11px] bg-[var(--navy)] text-white px-3 py-2 text-center rounded-[2px] hover:bg-[var(--navy-light)] font-semibold tracking-[0.04em]">VIEW PLAN ↗</a>
                    </div>
                  ) : (
                    <div className="h-full w-full grid place-items-center mono text-[10px] opacity-60 text-center p-4">
                      <div>
                        <div>FLOOR PLAN</div><div className="mt-1 font-bold">TOWER {t}</div>
                        <div className="mt-2 border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800 text-[9px]">NO PLAN UPLOADED</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mono text-[10px] mt-3 leading-relaxed">
                  {std && <div>Floors {std.floors}: {std.ids.length} flats • {std.bhk} • {rupees(std.maint)}</div>}
                  {ter && <div>Floor {ter.floors}: Terrace {ter.ids.length} flats • {ter.bhk} • {rupees(ter.maint)}</div>}
                  {(std?.sqft || ter?.sqft) && <div className="opacity-60">Built-up {std?.sqft ?? "—"} → {ter?.sqft ?? "—"} sqft</div>}
                </div>
                {ctx.isCommittee && <div className="mt-3 flex flex-wrap gap-2">
                  <label className="btn-gold mono text-[10px] px-3 py-1.5 tracking-[0.04em] inline-flex items-center">
                    {busy === t ? "UPLOADING…" : "UPLOAD FLOOR PLAN PDF/DWG"}
                    <input type="file" hidden accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg" disabled={!!busy}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(t, f); }} />
                  </label>
                </div>}
                {files.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {files.map((f) => (
                      <div key={f.key} className="flex items-center justify-between gap-2 mono text-[10px] border border-[var(--border)] bg-white px-2 py-1">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">{f.name}</a>
                        {ctx.isCommittee && <button onClick={() => remove(f)} className="text-red-600 shrink-0">✕</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 border border-amber-200 bg-amber-50 p-3 mono text-[10px] leading-relaxed">
          <div className="font-bold tracking-[0.08em]">TERRACE LOGIC</div>
          <div className="mt-1 opacity-80">Top-floor terrace ownership increases sqft and maintenance. Refer VAULT document marked IMPORTANT. Floor plan must clearly mark terrace ownership boundaries.</div>
        </div>
        <div className="mt-4 border-t border-dashed border-[var(--border)] pt-3 mono text-[10px] flex flex-wrap gap-3 opacity-60">
          <span>Who can upload: logged-in committee members</span><span>•</span><span>Max 4 MB per file</span><span>•</span><span>Newest upload is shown as the current plan</span>
        </div>
      </div>
    </div>
  );
}
