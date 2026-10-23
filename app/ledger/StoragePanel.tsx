"use client";
// ADMIN → STORAGE USED: how much space the database and file storage use, and what uses it.
import { useState } from "react";
import { api } from "@/lib/ledgerClient";

const LABELS: Record<string, string> = {
  events: "Event photos", eventdocs: "Event team documents", notices: "Notice posters & attachments", payproofs: "Payment screenshots (I have paid)",
  vault: "Society documents (VAULT)", flats: "Flat documents", amc: "AMC contracts", minutes: "Minutes attachments", backups: "Backups",
  "floor-plans": "Floor plans",
};
const DB_LIMIT = 500 * 1024 * 1024; // Supabase free plan
const R2_LIMIT = 10 * 1024 * 1024 * 1024; // Cloudflare R2 free allowance
const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

type Res = { folders: Record<string, { bytes: number; files: number }>; r2Error: string; db: { db_bytes: number; tables: { name: string; bytes: number; rows: number }[] } | null; dbError: string };

function Bar({ used, limit }: { used: number; limit: number }) {
  const p = Math.min(100, (used / limit) * 100);
  return <div className="h-2 bg-[var(--border)] mt-1.5"><div className={`h-2 ${p > 80 ? "bg-red-600" : p > 50 ? "bg-amber-500" : "bg-[var(--gold)]"}`} style={{ width: `${Math.max(p, 0.5)}%` }} /></div>;
}

export default function StoragePanel() {
  const [r, setR] = useState<Res | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function load() { setBusy(true); setErr(""); try { setR(await api("/api/storage")); } catch (e: any) { setErr(e.message); } setBusy(false); }
  const folders = r ? Object.entries(r.folders).sort((a, b) => b[1].bytes - a[1].bytes) : [];
  const r2Total = folders.reduce((n, [, f]) => n + f.bytes, 0);
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-bold tracking-[0.12em]">STORAGE USED</div>
          <div className="opacity-60 mt-1">How much space the society's records and files use, against the free limits.</div></div>
        <button onClick={load} disabled={busy} className="btn-navy px-4 py-2">{busy ? "CHECKING…" : r ? "CHECK AGAIN" : "CHECK STORAGE"}</button>
      </div>
      {err && <div className="mt-3 text-red-700">{err}</div>}
      {r && <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="border border-[var(--border)] bg-white p-3">
          <div className="font-bold">FILES (photos, screenshots, documents)</div>
          {r.r2Error ? <div className="mt-2 text-amber-800">{r.r2Error}</div> : <>
            <div className="mt-1"><b className="text-[14px]">{size(r2Total)}</b> of {size(R2_LIMIT)} free</div><Bar used={r2Total} limit={R2_LIMIT} />
            <table className="w-full mt-3"><tbody>
              {folders.map(([k, f]) => <tr key={k} className="border-t border-[var(--border)]"><td className="py-1.5 pr-2">{LABELS[k] || k}</td><td className="py-1.5 text-right opacity-70 whitespace-nowrap">{f.files} file{f.files === 1 ? "" : "s"}</td><td className="py-1.5 pl-3 text-right font-bold whitespace-nowrap">{size(f.bytes)}</td></tr>)}
              {!folders.length && <tr><td className="py-2 opacity-60">No files yet.</td></tr>}
            </tbody></table></>}
        </div>
        <div className="border border-[var(--border)] bg-white p-3">
          <div className="font-bold">DATABASE (flats, bills, receipts, notices, events…)</div>
          {r.db ? <>
            <div className="mt-1"><b className="text-[14px]">{size(r.db.db_bytes)}</b> of {size(DB_LIMIT)} free</div><Bar used={r.db.db_bytes} limit={DB_LIMIT} />
            <div className="opacity-60 mt-2">Biggest tables (includes the database's own working space):</div>
            <table className="w-full mt-1"><tbody>
              {r.db.tables.slice(0, 8).map((t) => <tr key={t.name} className="border-t border-[var(--border)]"><td className="py-1.5 pr-2">{t.name.replace(/_/g, " ")}</td><td className="py-1.5 text-right opacity-70 whitespace-nowrap">{t.rows} rows</td><td className="py-1.5 pl-3 text-right font-bold whitespace-nowrap">{size(t.bytes)}</td></tr>)}
            </tbody></table></> : <div className="mt-2 text-amber-800">{r.dbError || "Not available"}</div>}
        </div>
      </div>}
    </div>
  );
}
