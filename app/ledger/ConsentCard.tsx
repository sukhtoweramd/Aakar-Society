"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Flat } from "@/lib/society";

type F = Flat & { directory_consent?: boolean | null; directory_consent_at?: string | null; directory_consent_by?: string | null };

export default function ConsentCard({ flat, email, isCommittee, onSaved }: { flat: F; email: string; isCommittee: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = "directory_consent" in flat;
  const on = !!flat.directory_consent;

  async function toggle() {
    const next = !on;
    const msg = next
      ? "Show your family members' names, relation and mobile numbers to other logged-in members in the Directory?"
      : "Hide your family members and mobile numbers from the Directory? Flat number and owner name stay visible.";
    if (!confirm(msg)) return;
    setBusy(true); setError("");
    const { error } = await supabase.from("flats").update({
      directory_consent: next,
      directory_consent_at: new Date().toISOString(),
      directory_consent_by: isCommittee ? `${email} (committee, on behalf of flat)` : email,
    }).eq("id", flat.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  if (!ready) {
    return <div className="border border-dashed border-[var(--border)] p-4 mono text-[11px] opacity-70">Directory consent will appear here once the committee completes a one-time database step.</div>;
  }
  return (
    <div className={`border p-4 ${on ? "border-emerald-300 bg-emerald-50" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <div className="mono text-[10px] font-bold tracking-[0.14em]">MEMBER DIRECTORY CONSENT</div>
      <label className="mt-2 flex gap-3 items-start cursor-pointer">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={on} disabled={busy} onChange={toggle} />
        <span className="text-[13px] leading-snug">
          <b>Share our family details with society members.</b> Other logged-in members can see our family members&apos; names, relation and mobile numbers in the DIRECTORY tab.
          <span className="block mono text-[10px] opacity-60 mt-1">Without this, only the flat number and owner (or tenant) name are shown, as on the board near the lift. You can change this any time.</span>
        </span>
      </label>
      {flat.directory_consent_at && (
        <div className="mono text-[10px] opacity-60 mt-2">
          {on ? "Consent given" : "Consent withdrawn"} on {new Date(flat.directory_consent_at).toLocaleString("en-IN")}{flat.directory_consent_by ? ` by ${flat.directory_consent_by}` : ""}
        </div>
      )}
      {error && <div className="mt-2 text-red-700 mono text-[11px]">{error}</div>}
    </div>
  );
}
