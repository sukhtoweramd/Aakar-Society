"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/ledgerClient";

type Member = { id: string; email: string; name: string; created_at: string; last_sign_in_at: string | null; self: boolean };

export default function CommitteePanel() {
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
    try { const j = await post({ action: "add", email, name }); setCred({ email: j.email, password: j.password }); setEmail(""); setName(""); await load(); }
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
  async function remove(m: Member) {
    if (!confirm(`Remove the committee login for ${m.email}? They will no longer be able to log in.`)) return;
    setBusy(m.id); setError("");
    try { await post({ action: "remove", id: m.id }); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy(null);
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
      <div className="serif text-[22px] font-bold">COMMITTEE LOGINS</div>
      <div className="mono text-[11px] opacity-60 mt-1 max-w-[680px]">
        Each committee member logs in with their own email and has full admin rights. Ticking ★ Committee on a flat only shows the star; it does not give admin rights.
      </div>
      {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
      {cred && (
        <div className="mt-4 border-2 border-[var(--gold)] bg-[#fffdf5] p-4 mono text-[12px] flex flex-wrap gap-3 items-center justify-between">
          <div>NEW PASSWORD • SHOWN ONLY NOW<br /><b>{cred.email}</b> &nbsp; <span className="font-mono text-[14px]">{cred.password}</span>
            <div className="text-[10px] opacity-60 mt-1">Give this to them personally. They should change it with the PASSWORD button after logging in.</div></div>
          <button onClick={() => setCred(null)} className="btn-line px-3 py-1.5 text-[11px]">HIDE</button>
        </div>
      )}
      <div className="mt-4 border border-[var(--border)]">
        <table className="w-full mono text-[11px]">
          <thead><tr className="text-left">{["EMAIL", "NAME", "LAST LOGIN", ""].map((h) => <th key={h} className="p-2 bg-[var(--bg-soft)] border-b border-[var(--border)]">{h}</th>)}</tr></thead>
          <tbody>
            {(members || []).map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)]">
                <td className="p-2 font-semibold break-all">{m.email}{m.self && <span className="ml-2 text-[9px] bg-[var(--navy)] text-white px-1.5 py-0.5">YOU</span>}</td>
                <td className="p-2">{m.name || <span className="opacity-40">—</span>}</td>
                <td className="p-2">{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleDateString("en-IN") : <span className="text-amber-700">Not yet</span>}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {busy === m.id ? "…" : <>
                    <button onClick={() => reset(m)} className="underline mr-3">Reset password</button>
                    {!m.self && <button onClick={() => remove(m)} className="text-red-600">Remove</button>}
                  </>}
                </td>
              </tr>
            ))}
            {members === null && !error && <tr><td colSpan={4} className="p-3 opacity-60">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-2 mono text-[11px]">
        <input className="field" type="email" placeholder="Email of committee member *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" placeholder="Name (e.g. Ramesh Patel)" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={add} disabled={!!busy || !email.trim()} className="btn-navy px-4 py-2 tracking-[0.08em]">{busy === "add" ? "ADDING…" : "+ ADD COMMITTEE LOGIN"}</button>
      </div>
    </div>
  );
}
