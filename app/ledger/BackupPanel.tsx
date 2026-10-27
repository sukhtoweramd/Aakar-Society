"use client";
// ADMIN: download a full backup (also kept in R2), restore one (main admin only), and the access log.
import { useEffect, useState } from "react";
import { api, fmtSize } from "@/lib/ledgerClient";

type Stored = { id: string; kind: string; created: string; size: number };
type Info = { backups: Stored[] | null; r2: boolean; isMainAdmin: boolean; mainAdminEmail: string | null };
type LogRow = { id: number; at: string; actor: string; action: string; target: string; details: string };

const NAMES: Record<string, string> = { flats: "Flats", billing_settings: "Billing settings", signatories: "Signatories", events: "Events", notices: "Notices",
  maintenance: "Maintenance (old)", businesses: "Businesses", members: "Family members", emergency_contacts: "Emergency contacts", vehicles: "Vehicles",
  flat_docs: "Document types", bills: "Bills", payments: "Receipts", letters: "Letters", payment_reports: "\"I have paid\" reports",
  committee_areas: "Committee areas", amc_contracts: "AMC contracts", amc_visits: "AMC visits", meetings: "Meetings", meeting_actions: "Action points",
  event_team: "Event teams", event_money: "Event accounts", event_registrations: "Event registrations", help_guide: "HELP guide",
  complaints: "Complaints", nominees: "Nominees", nomination_status: "Nomination forms", booking_areas: "Booking areas", bookings: "Bookings",
  letter_requests: "Letter requests" };
const ACTIONS: Record<string, string> = { backup: "Backup taken", backup_downloaded: "Backup downloaded", restore: "RESTORE done", restore_failed: "Restore failed",
  login_removed: "Committee login removed", login_added: "Committee login added", password_reset: "Password reset",
  deleted_bill: "Bill deleted", deleted_receipt: "Receipt deleted", deleted_letter: "Letter deleted", test_documents_cleared: "TEST DOCUMENTS CLEARED", go_live: "GO LIVE",
  refused_add: "REFUSED: add login", refused_reset: "REFUSED: password reset", refused_link: "REFUSED: link flat" };
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const daysAgo = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 864e5);

function saveJson(b: any) {
  const blob = new Blob([JSON.stringify(b, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `Aakar_Backup_${String(b.created_at).slice(0, 10)}${b.kind === "pre-restore" ? "_before_restore" : ""}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function BackupPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [needsSql, setNeedsSql] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(""); const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<{ source: "file" | "id"; id?: string; backup?: any; created_at: string; created_by: string; counts: Record<string, number> } | null>(null);
  const [typed, setTyped] = useState("");

  async function load() {
    try { setInfo(await api("/api/backup")); } catch (e: any) { setError(e.message); }
    try { const j = await api("/api/backup?log=1"); setLog(j.log); setNeedsSql(!!j.needsSql); } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);
  const post = (body: any) => api("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function backupNow() {
    setBusy("backup"); setError(""); setMsg("");
    try {
      const j = await post({ action: "backup" });
      saveJson(j.backup);
      setMsg(j.stored ? "Backup downloaded to this device, and a copy is kept in the society's file storage." : "Backup downloaded to this device. (File storage is not set up, so no second copy was kept.)");
      await load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function download(s: Stored) {
    setBusy(s.id); setError("");
    try { saveJson((await api(`/api/backup?id=${encodeURIComponent(s.id)}`)).backup); } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function chooseStored(s: Stored) {
    setBusy(s.id); setError(""); setTyped("");
    try { const b = (await api(`/api/backup?id=${encodeURIComponent(s.id)}`)).backup; setPick({ source: "id", id: s.id, created_at: b.created_at, created_by: b.created_by, counts: b.counts }); }
    catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function chooseFile(file?: File) {
    if (!file) return; setError(""); setTyped("");
    if (file.size > 4 * 1024 * 1024) { setError("This file is too large to upload (over 4 MB). Use RESTORE on one of the saved copies listed above instead."); return; }
    try {
      const b = JSON.parse(await file.text());
      if (b?.app !== "aakar-society" || !b.tables?.flats?.length) throw new Error("This is not an Aakar Society backup file.");
      setPick({ source: "file", backup: b, created_at: b.created_at, created_by: b.created_by, counts: b.counts || {} });
    } catch (e: any) { setError(e.message.startsWith("This is not") ? e.message : "Could not read this file. Choose a backup file downloaded from this app."); }
  }
  async function restore() {
    if (!pick || typed !== "RESTORE") return;
    setBusy("restore"); setError(""); setMsg("");
    try {
      const j = await post(pick.source === "id" ? { action: "restore", id: pick.id } : { action: "restore", backup: pick.backup });
      setPick(null); setTyped("");
      setMsg(`Restore done: ${Object.entries(j.restored || {}).map(([t, n]) => `${NAMES[t] || t} ${n}`).join(", ")}. A safety copy of the records from just before the restore is saved in the list above. Reloading…`);
      setTimeout(() => window.location.reload(), 3500);
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }

  const manual = (info?.backups || []).filter((b) => b.kind === "manual");
  const last = manual[0];
  const overdue = !last || daysAgo(last.created) > 30;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6 mono text-[11px]">
      <div className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <div className="serif text-[22px] font-bold">BACKUP &amp; RESTORE</div>
          <div className="opacity-60 mt-1 max-w-[680px]">A backup holds all society records: flats, families, vehicles, contacts, notices, events, bills, receipts and settings. Logins and passwords are not in it, and uploaded documents stay in file storage.</div>
        </div>
        <button onClick={backupNow} disabled={!!busy} className="btn-navy px-5 py-2.5 tracking-[0.08em]">{busy === "backup" ? "MAKING BACKUP…" : "⬇ DOWNLOAD FULL BACKUP"}</button>
      </div>

      {info && <div className={`mt-4 p-3 border font-bold ${overdue ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        {last ? `Last backup: ${when(last.created)} (${daysAgo(last.created) === 0 ? "today" : `${daysAgo(last.created)} days ago`})` : "No backup taken yet."}
        {overdue && " • Please take a backup now and keep the file on two devices. Take one at least every month."}
      </div>}
      {info && !info.r2 && <div className="mt-2 text-amber-700">File storage (R2) is not set up: backups download to your device only, and restore is not available.</div>}
      {error && <div className="mt-3 border border-red-200 bg-red-50 text-red-700 p-3">{error}</div>}
      {msg && <div className="mt-3 border border-emerald-200 bg-emerald-50 text-emerald-800 p-3">{msg}</div>}

      {!!info?.backups?.length && (
        <div className="mt-4 border border-[var(--border)] overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr className="text-left">{["SAVED COPY", "TYPE", "SIZE", ""].map((h) => <th key={h} className="p-2 bg-[var(--bg-soft)] border-b border-[var(--border)]">{h}</th>)}</tr></thead>
            <tbody>{info.backups.slice(0, 12).map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="p-2 font-semibold">{when(s.created)}</td>
                <td className="p-2">{s.kind === "pre-restore" ? <span className="text-amber-700">Safety copy (before a restore)</span> : "Backup"}</td>
                <td className="p-2">{fmtSize(s.size)}</td>
                <td className="p-2 text-right whitespace-nowrap">{busy === s.id ? "…" : <>
                  <button onClick={() => download(s)} className="underline mr-3">Download</button>
                  {info.isMainAdmin && <button onClick={() => chooseStored(s)} className="text-red-700 underline">Restore…</button>}
                </>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="font-bold tracking-[0.08em]">RESTORE</div>
        {info && !info.isMainAdmin ? (
          <div className="opacity-70 mt-1">Only the main admin login{info.mainAdminEmail ? ` (${info.mainAdminEmail})` : ""} can restore a backup.</div>
        ) : info && (
          <>
            <div className="opacity-70 mt-1">Restore replaces ALL current records with the backup. A safety copy of the current records is saved first, so it can be undone.</div>
            {info.r2 && <label className="btn-line inline-block mt-2 px-3 py-1.5 cursor-pointer">CHOOSE BACKUP FILE…<input type="file" hidden accept=".json,application/json" onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ""; }} /></label>}
            {pick && (
              <div className="mt-3 border-2 border-red-300 bg-red-50 p-4 space-y-2">
                <div className="font-bold text-red-800">Restore the backup of {when(pick.created_at)}{pick.created_by ? ` (taken by ${pick.created_by})` : ""}?</div>
                <div>It contains: {Object.entries(pick.counts).map(([t, n]) => `${NAMES[t] || t} ${n}`).join(" • ")}</div>
                <div>Everything entered after that date will be replaced. Type <b>RESTORE</b> to confirm.</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input className="field !w-[160px]" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="Type RESTORE" />
                  <button onClick={restore} disabled={typed !== "RESTORE" || !!busy} className="bg-red-700 text-white font-bold px-4 py-2 disabled:opacity-40">{busy === "restore" ? "RESTORING…" : "RESTORE NOW"}</button>
                  <button onClick={() => { setPick(null); setTyped(""); }} className="underline">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="font-bold tracking-[0.08em]">ACCESS LOG</div>
        {needsSql ? <div className="opacity-70 mt-1">Run BACKUP_RESTORE.sql in Supabase to turn on the access log.</div> : (
          <div className="mt-2 border border-[var(--border)] overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full min-w-[620px]">
              <thead><tr className="text-left">{["WHEN", "BY", "WHAT", "DETAIL"].map((h) => <th key={h} className="p-2 bg-[var(--bg-soft)] border-b border-[var(--border)] sticky top-0">{h}</th>)}</tr></thead>
              <tbody>
                {(log || []).map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)] align-top">
                    <td className="p-2 whitespace-nowrap">{when(r.at)}</td><td className="p-2 break-all">{r.actor}</td>
                    <td className={`p-2 font-semibold ${/restore|removed/.test(r.action) ? "text-red-700" : ""}`}>{ACTIONS[r.action] || r.action}</td>
                    <td className="p-2 break-all opacity-80">{[r.target, r.details].filter(Boolean).join(" • ")}</td>
                  </tr>))}
                {log && !log.length && <tr><td colSpan={4} className="p-3 opacity-60">Nothing recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
