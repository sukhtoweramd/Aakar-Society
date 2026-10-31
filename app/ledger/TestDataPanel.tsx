"use client";
// ADMIN: before going live, the main admin can clear every bill, receipt and letter made while testing
// and set the numbers to the last ones used on paper. GO LIVE locks this for ever.
import { useEffect, useState } from "react";
import { api } from "@/lib/ledgerClient";
import { supabase } from "@/lib/supabaseClient";

type Info = { isMainAdmin: boolean; live: { live_at: string; live_by: string } | null; needsSql: boolean; counts: { bills: number | null; receipts: number | null; letters: number | null } };
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function TestDataPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [last, setLast] = useState({ bill: "0", other: "0", rcpt: "0", letter: "0" });
  const [hasLetters, setHasLetters] = useState(false);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [msg, setMsg] = useState("");

  async function load() {
    try { setInfo(await api("/api/docs")); } catch (e: any) { setError(e.message); }
    const { data } = await supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setHasLetters("letter_last_no" in data);
  }
  useEffect(() => { load(); }, []);
  if (!info) return null;

  if (info.live) return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] px-6 py-4 mono text-[11px] flex flex-wrap gap-2 items-center">
      <span className="tag bg-emerald-50 text-emerald-700 font-bold">LIVE</span>
      <span>Live since {when(info.live.live_at)}{info.live.live_by ? ` (${info.live.live_by})` : ""}. Clearing test documents is locked for ever; wrong documents are cancelled with a reason.</span>
    </div>
  );

  const c = info.counts;
  async function clear() {
    setError(""); setMsg("");
    const typed = prompt(`CLEAR ALL TEST DATA?\n\nThis removes for every flat: ALL ${c.bills ?? 0} bills, ${c.receipts ?? 0} receipts, ${c.letters ?? 0} letters, and all "I have paid" reports, letter requests, events (team, accounts, registrations, gate scans), meetings and minutes, complaints, common plot bookings, notices and banners, AMC contracts and nominees, with their photos and files. Numbers are set to:\n` +
      `maintenance bills ${last.bill}, other bills ${last.other}, receipts ${last.rcpt}${hasLetters ? `, letters ${last.letter}` : ""}.\n\nKEPT: flats, owners, family, vehicles, flat documents, businesses, committee, areas, contacts, templates, logins and settings. A backup of the data is saved first (deleted photos and files cannot be brought back).\n\nType CLEAR to confirm:`);
    if (typed?.trim().toUpperCase() !== "CLEAR") return;
    setBusy("clear");
    try {
      const j = await api("/api/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear_test", last }) });
      const cl = j.cleared || {}, num = (k: string) => Number(cl[k] || 0);
      setMsg(j.all
        ? `Cleared ${num("bills")} bills, ${num("payments")} receipts, ${num("letters")} letters, ${num("events")} events, ${num("meetings")} meetings, ${num("complaints")} complaints, ${num("bookings")} bookings, ${num("notices")} notices, ${num("amc_contracts")} AMC contracts, ${num("nominees")} nominees`
          + (j.files ? ` and ${j.files.deleted} files${j.files.failed ? ` (${j.files.failed} files could not be deleted)` : ""}` : " (files were NOT deleted: storage error)")
          + ". A backup of the data is in the backups list above."
        : `Cleared ${num("bills")} bills, ${num("receipts")} receipts and ${num("letters")} letters only. Run sql-security/12_CLEAR_TEST_ALL.sql in Supabase to clear events, minutes, complaints and the rest, then clear again.`);
      await load();
    } catch (e: any) { setError(e.message); }
    setBusy("");
  }
  async function goLive() {
    setError(""); setMsg("");
    const typed = prompt(`GO LIVE?\n\nAfter this, test documents can never be cleared in bulk again (not even by the main admin, not even by restoring a backup). From now on every bill, receipt and letter is real.\n\nType GO LIVE to confirm:`);
    if (typed?.trim().toUpperCase() !== "GO LIVE") return;
    setBusy("live");
    try { await api("/api/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "go_live" }) }); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy("");
  }
  const N = (k: keyof typeof last, l: string) => (
    <label className="text-[10px] opacity-80">{l}<input className="field mt-1 !w-[110px] text-right" inputMode="numeric" value={last[k]} onChange={(e) => setLast({ ...last, [k]: e.target.value.replace(/\D/g, "") })} /></label>
  );

  return (
    <div className="bg-[#fff8f0] border-2 border-dashed border-amber-400 rounded-[4px] p-6 mono text-[11px]">
      <div className="flex flex-wrap gap-2 items-center"><span className="tag bg-amber-100 text-amber-800 font-bold">TESTING</span><span className="font-bold tracking-[0.12em]">TEST DOCUMENTS • BEFORE GOING LIVE</span></div>
      <div className="opacity-70 mt-2 max-w-[760px] leading-relaxed">
        Now: {c.bills ?? 0} bills, {c.receipts ?? 0} receipts{c.letters != null ? `, ${c.letters} letters` : ""} in the app.
        While testing, the main admin can clear all test data in one go — bills, receipts, letters, "I have paid" reports, letter requests, events, minutes, complaints, bookings, notices, AMC contracts and nominees, with their photos and files — and set the numbers to the last ones used on paper. Flats, owners, family, vehicles, flat documents, committee, contacts, logins and settings stay.
        This can be done as often as needed until you press GO LIVE. After GO LIVE it is locked for ever.
      </div>
      {info.needsSql && <div className="mt-3 border border-amber-200 bg-amber-50 p-2.5">Run BACKUP_RESTORE.sql in Supabase to turn this on.</div>}
      {error && <div className="mt-3 border border-red-200 bg-red-50 text-red-700 p-2.5">{error}</div>}
      {msg && <div className="mt-3 border border-emerald-200 bg-emerald-50 text-emerald-800 p-2.5">{msg}</div>}
      {!info.needsSql && (info.isMainAdmin ? (
        <>
          <div className="mt-4 text-[10px] font-bold tracking-[0.12em]">AFTER CLEARING, CONTINUE NUMBERS FROM (LAST NO. USED ON PAPER; 0 = START AT 1)</div>
          <div className="flex flex-wrap gap-3 mt-2">
            {N("bill", "MAINTENANCE BILLS")}{N("other", "OTHER BILLS")}{N("rcpt", "RECEIPTS")}{hasLetters && N("letter", "LETTERS")}
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <button onClick={clear} disabled={!!busy} className="bg-red-700 text-white font-bold tracking-[0.06em] px-4 py-2.5 rounded-[3px]">{busy === "clear" ? "BACKING UP AND CLEARING…" : "🗑 CLEAR ALL TEST DOCUMENTS"}</button>
            <button onClick={goLive} disabled={!!busy} className="btn-navy font-bold tracking-[0.06em] px-4 py-2.5">{busy === "live" ? "…" : "✓ GO LIVE (LOCK FOR EVER)"}</button>
          </div>
        </>
      ) : <div className="mt-3 opacity-70">Only the main admin login can clear test documents or press GO LIVE.</div>)}
    </div>
  );
}
