"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/ledgerClient";
import { label, type Flat } from "@/lib/society";

type Member = { id: string; email: string; name: string; flat_id: string | null; created_at: string; last_sign_in_at: string | null; self: boolean; main?: boolean };

export default function CommitteePanel({ flats }: { flats: Flat[] }) {
  const [flatId, setFlatId] = useState("");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    try { setMembers((await api("/api/committee")).members); setError(""); } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  const post = (body: any) => api("/api/committee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function add() {
    if (!email.trim()) return;
    if (!confirm(`Give ${email.trim()} a committee (admin) login? They will be able to change everything in the app.`)) return;
    setBusy("add"); setError("");
    try { const j = await post({ action: "add", email, name, flat_id: flatId }); setCred({ email: j.email, password: j.password }); setEmail(""); setName(""); setFlatId(""); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function reset(m: Member) {
    if (!confirm(`Reset the password for ${m.email}? Their old password stops working immediately.`)) return;
    setBusy(m.id); setError("");
    try { const j = await post({ action: "reset", id: m.id }); setCred({ email: j.email, password: j.password }); }
    catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function link(m: Member, flat: string) {
    setBusy(m.id); setError("");
    try {
      await post({ action: "link", id: m.id, flat_id: flat }); await load();
      if (m.self) alert("Saved. Log out and log in again to see the MY FLAT button.");
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  const flatOptions = (
    <>
      <option value="">— Own flat —</option>
      {flats.map((f) => <option key={f.id} value={f.id}>{label(f)}{f.owner_name ? ` • ${f.owner_name}` : ""}</option>)}
    </>
  );
  async function remove(m: Member, reason = "removed from ADMIN") {
    if (!confirm(`Remove the committee login for ${m.email}? They will no longer be able to log in as committee.${m.flat_id ? " Their own flat login is not affected." : ""}`)) return;
    setBusy(m.id); setError("");
    try { await post({ action: "remove", id: m.id, reason }); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy(null);
  }

  const flatOf = (id: string | null) => flats.find((f) => f.id === id);
  const stale = (m: Member) => !m.main && !!m.flat_id && !!flatOf(m.flat_id) && !flatOf(m.flat_id)!.is_committee;
  const unlinked = (m: Member) => !m.main && !m.flat_id;
  const staleCount = (members || []).filter(stale).length;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
      <div className="serif text-[22px] font-bold">COMMITTEE LOGINS</div>
      <div className="mono text-[11px] opacity-60 mt-1 max-w-[680px]">
        Each committee member logs in with their own email and has full admin rights. Ticking ★ Committee on a flat only shows the star; it does not give admin rights. Link each login to the member&apos;s own flat: it gives them a MY FLAT button, and when that flat&apos;s ★ Committee tick is removed, their committee login is removed too. The main admin (the society&apos;s own login) cannot be removed.
      </div>
      {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
      {staleCount > 0 && <div className="mt-4 border-2 border-red-300 bg-red-50 text-red-800 p-3 mono text-[11px] font-bold">⚠ {staleCount} committee login{staleCount > 1 ? "s belong" : " belongs"} to someone no longer marked as committee. Remove {staleCount > 1 ? "them" : "it"} below.</div>}
      {cred && (
        <div className="mt-4 border-2 border-[var(--gold)] bg-[#fffdf5] p-4 mono text-[12px] flex flex-wrap gap-3 items-center justify-between">
          <div>NEW PASSWORD • SHOWN ONLY NOW<br /><b>{cred.email}</b> &nbsp; <span className="font-mono text-[14px]">{cred.password}</span>
            <div className="text-[10px] opacity-60 mt-1">Give this to them personally. They should change it with the PASSWORD button after logging in.</div></div>
          <button onClick={() => setCred(null)} className="btn-line px-3 py-1.5 text-[11px]">HIDE</button>
        </div>
      )}
      <div className="mt-4 border border-[var(--border)]">
        <table className="w-full mono text-[11px]">
          <thead><tr className="text-left">{["EMAIL", "NAME", "OWN FLAT", "LAST LOGIN", ""].map((h) => <th key={h} className="p-2 bg-[var(--bg-soft)] border-b border-[var(--border)]">{h}</th>)}</tr></thead>
          <tbody>
            {(members || []).map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)]">
                <td className="p-2 font-semibold break-all">{m.email}{m.self && <span className="ml-2 text-[9px] bg-[var(--navy)] text-white px-1.5 py-0.5">YOU</span>}{m.main && <span className="ml-2 text-[9px] bg-[var(--gold)] text-black px-1.5 py-0.5">MAIN ADMIN</span>}
                  {stale(m) && <div className="text-red-700 font-bold mt-1">⚠ {label(flatOf(m.flat_id)!)} is no longer marked committee</div>}
                  {unlinked(m) && <div className="text-amber-700 font-normal mt-1">Link to own flat, so access ends automatically when they leave the committee</div>}</td>
                <td className="p-2">{m.name || <span className="opacity-40">—</span>}</td>
                <td className="p-2">
                  <select className="field !py-1 !text-[11px] max-w-[190px]" value={m.flat_id || ""} disabled={busy === m.id} onChange={(e) => link(m, e.target.value)}>{flatOptions}</select>
                </td>
                <td className="p-2">{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleDateString("en-IN") : <span className="text-amber-700">Not yet</span>}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {busy === m.id ? "…" : <>
                    <button onClick={() => reset(m)} className="underline mr-3">Reset password</button>
                    {!m.self && !m.main && <button onClick={() => remove(m, stale(m) ? "no longer on the committee" : "removed from ADMIN")} className={stale(m) ? "bg-red-600 text-white px-2 py-1 font-bold" : "text-red-600"}>{stale(m) ? "REMOVE NOW" : "Remove"}</button>}
                  </>}
                </td>
              </tr>
            ))}
            {members === null && !error && <tr><td colSpan={5} className="p-3 opacity-60">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 mono text-[11px]">
        <input className="field" type="email" placeholder="Email of committee member *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" placeholder="Name (e.g. Ramesh Patel)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="field" value={flatId} onChange={(e) => setFlatId(e.target.value)}>{flatOptions}</select>
        <button onClick={add} disabled={!!busy || !email.trim()} className="btn-navy px-4 py-2 tracking-[0.08em]">{busy === "add" ? "ADDING…" : "+ ADD COMMITTEE LOGIN"}</button>
      </div>
    </div>
  );
}
