"use client";
import { useState } from "react";
import PasswordInput from "./PasswordInput";
import { supabase } from "@/lib/supabaseClient";
import { SOCIETY } from "@/lib/society";
import { flatEmail, normaliseFlat } from "@/lib/residents";
import { InstallApp } from "./PwaRegister";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    // Residents type their flat number (A-101); committee members type their email.
    const flat = email.includes("@") ? null : normaliseFlat(email);
    if (!email.includes("@") && !flat) { setBusy(false); setError("Enter your email, or your flat number like A-101"); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: flat ? flatEmail(flat) : email.trim(), password: pass });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Wrong flat number / email or password" : error.message);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <div className="w-full bg-[var(--navy)] text-[#fdfcf5] mono text-[12px] tracking-[0.06em] uppercase">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 min-h-[38px] py-1.5 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
            SOCIETY LEDGER
          </span>
          <span className="opacity-40">•</span>
          <span>AHMEDABAD</span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--gold)] font-semibold">{SOCIETY.reg}</span>
        </div>
      </div>
      <div className="flex-1 grid place-items-center p-4">
        <div className="w-full max-w-[920px] grid md:grid-cols-[1fr_1fr] border border-[var(--border)] rounded-[4px] overflow-hidden bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="bg-[var(--navy)] text-[#fdfcf5] p-8 md:p-10 flex flex-col justify-between">
            <div>
              <div className="h-14 w-14 rounded-full border border-[var(--gold)] grid place-items-center text-[30px] serif text-[var(--gold)]">ॐ</div>
              <h1 className="serif text-[40px] leading-[0.95] mt-6 tracking-[0.02em] font-[800]">AAKAR<br />CO-OP</h1>
              <div className="mono text-[11px] tracking-[0.3em] mt-3 opacity-80">HOUSING SOCIETY LTD.</div>
            </div>
            <div className="mono text-[11px] mt-10 opacity-80 leading-relaxed">
              {SOCIETY.building} • REG NO {SOCIETY.reg}<br />
              DATE {SOCIETY.regDate}<br />
              {SOCIETY.addressLines.join(" • ")}
            </div>
          </div>
          <form onSubmit={submit} className="p-8 md:p-10">
            <div className="serif text-[22px] font-bold">Member Login</div>
            <div className="mono text-[11px] opacity-60 mt-1">Residents: log in with your flat number. Committee: log in with your email.</div>
            <div className="mt-6 space-y-4">
              <label className="block">
                <div className="mono text-[10px] tracking-[0.16em]">FLAT NUMBER OR EMAIL</div>
                <input type="text" autoComplete="username" autoCapitalize="characters" required value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1 mono" placeholder="A-101  or  you@example.com" />
              </label>
              <div className="block">
                <div className="mono text-[10px] tracking-[0.16em]">PASSWORD</div>
                <PasswordInput autoComplete="current-password" required value={pass} onChange={setPass} />
              </div>
              {error && <div className="mono text-[12px] text-red-700 border border-red-200 bg-red-50 px-3 py-2">{error}</div>}
              <button disabled={busy} className="btn-navy w-full mono text-[12px] tracking-[0.16em] py-3">{busy ? "CHECKING…" : "LOGIN"}</button>
              <div className="mono text-[10px] opacity-50 text-center">No password yet, or forgot it? Ask the society committee.</div>
              <InstallApp variant="card" />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
