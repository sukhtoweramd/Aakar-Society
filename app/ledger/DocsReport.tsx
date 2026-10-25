"use client";
// REPORTS → Flat documents: which of the society's required documents each flat has uploaded.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { isRented, label, ownerText, sortFlats, SOCIETY, type Flat } from "@/lib/society";
import { DOC_TYPES, docChecklist } from "@/lib/flatDocTypes";
import { backBar } from "@/lib/printBack";

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function DocsReport({ list, scope }: { list: Flat[]; scope: string }) {
  const [rows, setRows] = useState<{ flat_id: string; doc_type: string | null }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);
  useEffect(() => {
    supabase.from("flat_docs").select("flat_id, doc_type").then(({ data, error }) => { setFailed(!!error); setRows((data as any[]) || []); });
  }, []);

  const table = useMemo(() => [...list].sort(sortFlats).map((f) => {
    const check = docChecklist((rows || []).filter((r) => r.flat_id === f.id).map((r) => r.doc_type), isRented(f));
    return { f, check, missing: check.filter((c) => !c.uploaded).length };
  }), [list, rows]);
  const shown = onlyMissing ? table.filter((t) => t.missing) : table;
  const complete = table.filter((t) => !t.missing).length;

  function print() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to print."); return; }
    const cell = (t: (typeof table)[number], key: string) => { const c = t.check.find((x) => x.key === key); return !c ? '<td class="na">—</td>' : c.uploaded ? '<td class="ok">✓</td>' : '<td class="no">✗</td>'; };
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Flat documents</title><style>
      body{font:11px Arial,sans-serif;margin:0 14px}h1{font-size:14px;margin:6px 0 2px}.sub{opacity:.7;margin-bottom:8px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:3px 4px;text-align:center}th{background:#0f1d3d;color:#fff;font-size:9.5px}
      td.l{text-align:left}.ok{color:#047857;font-weight:700}.no{color:#b42318;font-weight:700}.na{color:#999}@page{size:A4 landscape;margin:10mm}</style></head><body>
      ${backBar()}<h1>ॐ ${esc(SOCIETY.full)} — FLAT DOCUMENTS</h1><div class="sub">${esc(scope)} • ${esc(new Date().toLocaleDateString("en-IN"))} • ✓ uploaded ✗ missing — not needed • ${complete} of ${table.length} flats complete</div>
      <table><thead><tr><th>Flat</th><th>Owner</th>${DOC_TYPES.map((d) => `<th>${esc(d.name)}</th>`).join("")}<th>Missing</th></tr></thead><tbody>
      ${shown.map((t) => `<tr><td class="l"><b>${esc(label(t.f))}</b></td><td class="l">${esc(ownerText(t.f))}</td>${DOC_TYPES.map((d) => cell(t, d.key)).join("")}<td>${t.missing}</td></tr>`).join("")}
      </tbody></table></body></html>`);
    w.document.close();
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--bg)] p-5">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <div className="mono text-[11px] font-bold tracking-[0.14em]">FLAT DOCUMENTS</div>
          <div className="mono text-[11px] opacity-70 mt-1">{rows === null ? "Loading…" : failed ? "Document types are not set up yet." : `${complete} of ${table.length} flats have every document • rent agreement counted only for rented flats`}</div>
        </div>
        <div className="flex gap-2 items-center mono text-[11px]">
          <label className="flex items-center gap-1"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> only flats with missing documents</label>
          <button onClick={print} className="btn-navy px-3 py-1.5">PRINT / PDF</button>
        </div>
      </div>
      <div className="mt-3 overflow-auto max-h-[420px]">
        <table className="w-full mono text-[10.5px] border-collapse">
          <thead className="sticky top-0 bg-[var(--navy)] text-white"><tr><th className="text-left px-2 py-1.5">Flat</th>{DOC_TYPES.map((d) => <th key={d.key} className="px-1.5 py-1.5 font-semibold">{d.name}</th>)}<th className="px-2">Missing</th></tr></thead>
          <tbody>{shown.map((t) => (
            <tr key={t.f.id} className="border-b border-[var(--border)]">
              <td className="px-2 py-1 whitespace-nowrap"><b>{label(t.f)}</b> <span className="opacity-60">{ownerText(t.f)}</span></td>
              {DOC_TYPES.map((d) => { const c = t.check.find((x) => x.key === d.key); return <td key={d.key} className={`text-center ${!c ? "opacity-30" : c.uploaded ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}`}>{!c ? "—" : c.uploaded ? "✓" : "✗"}</td>; })}
              <td className="text-center">{t.missing}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
