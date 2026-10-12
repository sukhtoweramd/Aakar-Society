"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ChangePassword({ forced, who, onDone }: { forced: boolean; who: string; onDone: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (p1.length < 8) { setError("Use at least 8 characters."); return; }
    if (p1 !== p2) { setError("The two passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1, data: { password_changed: true } });
    if (!error) await supabase.auth.refreshSession();
    setBusy(false);
    if (error) { setError(error.message); return; }
    onDone();
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-[440px] bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-8">
        <div className="h-12 w-12 rounded-full border border-[var(--gold)] grid place-items-center serif text-[24px] text-[var(--navy)]">ॐ</div>
        <div className="serif text-[22px] font-bold mt-4">{forced ? "Set your own password" : "Change password"}</div>
        <div className="mono text-[11px] opacity-60 mt-1">
          {forced ? `Welcome, ${who}. Please replace the password the committee gave you with one only you know.` : who}
        </div>
        <div className="mt-6 space-y-4">
          <label className="block"><div className="mono text-[10px] tracking-[0.16em]">NEW PASSWORD</div>
            <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} className="field mt-1 mono" required /></label>
          <label className="block"><div className="mono text-[10px] tracking-[0.16em]">REPEAT NEW PASSWORD</div>
            <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} className="field mt-1 mono" required /></label>
          {error && <div className="mono text-[12px] text-red-700 border border-red-200 bg-red-50 px-3 py-2">{error}</div>}
          <button disabled={busy} className="btn-navy w-full mono text-[12px] tracking-[0.16em] py-3">{busy ? "SAVING…" : "SAVE PASSWORD"}</button>
          {forced
            ? <button type="button" onClick={() => supabase.auth.signOut()} className="w-full mono text-[11px] opacity-60 underline">Log out</button>
            : <button type="button" onClick={onDone} className="btn-line w-full mono text-[11px] py-2.5">CANCEL</button>}
        </div>
      </form>
    </div>
  );
}
