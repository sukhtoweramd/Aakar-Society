"use client";
import { useEffect, useState } from "react";
import { label } from "@/lib/society";
import { api } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";

type Login = { flat_id: string; created_at: string; last_sign_in_at: string | null; password_changed: boolean };
type Cred = { flat_id: string; password: string };
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function LoginsPanel({ ctx }: { ctx: Ctx }) {
  const { flats } = ctx;
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [error, setError] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [tower, setTower] = useState("ALL");

  async function load() {
    try { setLogins((await api("/api/residents")).logins); setError(""); }
    catch (e: any) { setError(e.message); setNeedsKey(/SECRET_KEY/.test(e.message)); }
  }
  useEffect(() => { load(); }, []);

  const byFlat = new Map((logins || []).map((l) => [l.flat_id, l]));
  const list = flats.filter((f) => tower === "ALL" || f.tower === tower);
  const missing = list.filter((f) => !byFlat.has(f.id)).map((f) => f.id);

  async function create(ids: string[]) {
    if (!ids.length) return;
    if (ids.length > 1 && !confirm(`Create logins for ${ids.length} flats? Each gets a new random password that is shown only once.`)) return;
    setBusy(ids.length > 1 ? "bulk" : ids[0]); setError("");
    try {
      const j = await api("/api/residents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", flats: ids }) });
      setCreds((c) => [...j.created, ...c.filter((x) => !j.created.some((n: Cred) => n.flat_id === x.flat_id))]);
      if (j.skipped?.length) setError(`Skipped: ${j.skipped.join(", ")}`);
      await load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function reset(id: string) {
    if (!confirm(`Reset the password for ${id}? Their old password stops working immediately.`)) return;
    setBusy(id); setError("");
    try {
      const j = await api("/api/residents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", flat: id }) });
      setCreds((c) => [{ flat_id: j.flat_id, password: j.password }, ...c.filter((x) => x.flat_id !== j.flat_id)]);
      await load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function remove(id: string) {
    if (!confirm(`Remove the login for ${id}? They will no longer be able to log in.`)) return;
    setBusy(id); setError("");
    try { await api("/api/residents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", flat: id }) }); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy(null);
  }

  function printSlips() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups."); return; }
    const site = window.location.origin;
    w.document.write(`<html><head><title>Aakar Co-op login slips</title><style>
      body{font-family:Arial,sans-serif;margin:16px} .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .slip{border:1px dashed #0f1d3d;padding:12px 14px;page-break-inside:avoid} h3{margin:0 0 4px;color:#0f1d3d;font-size:14px}
      .big{font-size:18px;font-weight:bold;letter-spacing:.05em;font-family:monospace} .small{font-size:11px;color:#555}
    </style></head><body><div class="grid">${creds.map((c) => `<div class="slip"><h3>ॐ Aakar Co-op • Sukh Tower</h3>
      <div class="small">Website: ${esc(site)}</div>
      <div>Flat: <span class="big">${esc(label({ id: c.flat_id, flat_no: c.flat_id } as any))}</span></div>
      <div>Password: <span class="big">${esc(c.password)}</span></div>
      <div class="small">Log in with your flat number and this password. You will be asked to set your own password.</div></div>`).join("")}
    </div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  function downloadCsv() {
    const csv = "﻿Flat,Password\r\n" + creds.map((c) => `${label({ id: c.flat_id, flat_no: c.flat_id } as any)},${c.password}`).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "Aakar_flat_logins.csv"; a.click();
  }

  const status = (id: string) => {
    const l = byFlat.get(id);
    if (!l) return <span className="opacity-50">No login</span>;
    if (!l.password_changed) return <span className="text-amber-700">Created • not used yet</span>;
    return <span className="text-emerald-700">Active{l.last_sign_in_at ? ` • ${new Date(l.last_sign_in_at).toLocaleDateString("en-IN")}` : ""}</span>;
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
      <div className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <div className="serif text-[22px] font-bold">RESIDENT LOGINS</div>
          <div className="mono text-[11px] opacity-60 mt-1 max-w-[640px]">One login per flat. Residents log in with their flat number (A-101) and the password you give them, then must set their own. They can edit only their own flat and family members.</div>
        </div>
        {logins && (
          <div className="mono text-[10px] border border-[var(--border)] px-3 py-2 bg-[var(--bg)]">
            {logins.length} / {flats.length} flats have a login • {logins.filter((l) => l.password_changed).length} active
          </div>
        )}
      </div>

      {needsKey ? (
        <div className="mt-4 border border-amber-300 bg-[#fff8d6] p-4 mono text-[11px] leading-relaxed">
          <div className="font-bold">ONE-TIME SETUP NEEDED</div>
          Creating logins needs the Supabase <b>secret key</b> on the server. Add it in Vercel → Settings → Environment Variables as <b>SUPABASE_SECRET_KEY</b>, then Redeploy.
        </div>
      ) : error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}

      {creds.length > 0 && (
        <div className="mt-4 border-2 border-[var(--gold)] bg-[#fffdf5] p-4">
          <div className="flex flex-wrap justify-between gap-2 items-center">
            <div className="mono text-[11px] font-bold tracking-[0.08em]">NEW PASSWORDS • SHOWN ONLY NOW • {creds.length}</div>
            <div className="flex gap-2">
              <button onClick={printSlips} className="btn-navy mono text-[11px] px-3 py-1.5">PRINT SLIPS</button>
              <button onClick={downloadCsv} className="btn-line mono text-[11px] px-3 py-1.5">DOWNLOAD CSV</button>
              <button onClick={() => { if (confirm("Hide these passwords? Save or print them first.")) setCreds([]); }} className="btn-line mono text-[11px] px-3 py-1.5">HIDE</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mono text-[11px] max-h-[220px] overflow-auto">
            {creds.map((c) => <div key={c.flat_id} className="border border-[var(--border)] bg-white px-2 py-1.5"><b>{label({ id: c.flat_id, flat_no: c.flat_id } as any)}</b> <span className="font-mono">{c.password}</span></div>)}
          </div>
        </div>
      )}

      {logins && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {["ALL", ...Array.from(new Set(flats.map((f) => f.tower).filter(Boolean))) as string[]].map((t) => (
              <button key={t} onClick={() => setTower(t)} className={`mono text-[11px] px-3 py-1.5 border rounded-[2px] ${tower === t ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>{t === "ALL" ? "ALL" : `TOWER ${t}`}</button>
            ))}
            <button onClick={() => create(missing)} disabled={!missing.length || !!busy} className="btn-gold mono text-[11px] px-4 py-1.5 ml-auto disabled:opacity-50">
              {busy === "bulk" ? "CREATING…" : `CREATE ${missing.length} MISSING LOGIN${missing.length === 1 ? "" : "S"}`}
            </button>
          </div>
          <div className="mt-3 border border-[var(--border)] max-h-[420px] overflow-auto">
            <table className="w-full mono text-[11px]">
              <thead className="bg-[var(--bg-soft)] sticky top-0"><tr className="text-left">
                <th className="p-2">FLAT</th><th className="p-2">OWNER</th><th className="p-2">LOGIN</th><th className="p-2 text-right">ACTIONS</th>
              </tr></thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id} className="border-t border-[var(--border)]">
                    <td className="p-2 font-bold">{label(f)}</td>
                    <td className="p-2 truncate max-w-[200px]">{f.owner_name || <span className="opacity-40">—</span>}</td>
                    <td className="p-2">{status(f.id)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {busy === f.id ? "…" : byFlat.has(f.id) ? (
                        <><button onClick={() => reset(f.id)} className="underline mr-3">Reset password</button><button onClick={() => remove(f.id)} className="text-red-600">Remove</button></>
                      ) : <button onClick={() => create([f.id])} className="underline">Create login</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
