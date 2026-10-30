"use client";
// Committee: the tenant login of a rented flat (TENANT_LOGINS.sql). Create (shows the first password once), reset the
// password, or revoke. Revoking stops the login at once; the tenant's family, vehicles and complaints stay.
import { useEffect, useState } from "react";
import { api } from "@/lib/ledgerClient";
import { label, type Flat } from "@/lib/society";

type TenantLogin = { flat_id: string; created_at: string; last_sign_in_at: string | null; password_changed: boolean; active: boolean; revoked_at: string | null; revoke_reason: string | null };

export default function TenantLoginCard({ flat }: { flat: Flat }) {
  const [info, setInfo] = useState<TenantLogin | null | undefined>(undefined);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState<{ login: string; password: string } | null>(null);
  const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "never");

  async function load() {
    try { const j = await api("/api/residents"); setInfo(((j.tenants || []) as TenantLogin[]).find((t) => t.flat_id === flat.id) || null); setError(""); }
    catch (e: any) { setError(e.message); setInfo(null); }
  }
  useEffect(() => { load(); }, [flat.id]);

  async function act(action: "tenant_create" | "tenant_reset" | "tenant_revoke") {
    const what = action === "tenant_create" ? `Create a tenant login for ${label(flat)}${flat.tenant_name ? ` (${flat.tenant_name})` : ""}?${info ? "\n\nThe old, switched-off tenant login is replaced." : ""}`
      : action === "tenant_reset" ? `Give the tenant of ${label(flat)} a new password? The old one stops working.`
      : `Revoke the tenant login of ${label(flat)}? The tenant can no longer log in. Family, vehicles and complaints are kept.`;
    if (!confirm(what)) return;
    setBusy(true); setError("");
    try {
      const j = await api("/api/residents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, flat: flat.id }) });
      setCred(j.password ? { login: j.login, password: j.password } : null);
      await load();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--bg)] p-3 mono text-[11px] space-y-2 min-w-0">
      <div className="font-bold tracking-[0.12em] text-[10px]">TENANT LOGIN</div>
      {info === undefined ? <div className="opacity-60">Checking…</div>
        : info && info.active ? <div>Active • log in as <b>{label(flat)}-T</b> • created {day(info.created_at)} • last used {day(info.last_sign_in_at)}{info.password_changed ? "" : " • first password not changed yet"}</div>
        : info ? <div className="text-amber-800">Switched off{info.revoked_at ? ` on ${day(info.revoked_at)}` : ""}{info.revoke_reason ? ` (${info.revoke_reason})` : ""}.</div>
        : <div className="opacity-70">No tenant login. The tenant can have their own login for family, vehicles, complaints and common plot booking; bills and documents stay with the owner.</div>}
      {cred && <div className="border-2 border-emerald-400 bg-emerald-50 p-2">Give these to the tenant (shown only now): login <b>{cred.login}</b> • password <b className="select-all">{cred.password}</b>. They must set their own password at first login.</div>}
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {(!info || !info.active) && <button disabled={busy} onClick={() => act("tenant_create")} className="btn-navy px-3 min-h-[44px]">{busy ? "…" : "CREATE TENANT LOGIN"}</button>}
        {info?.active && <button disabled={busy} onClick={() => act("tenant_reset")} className="btn-line px-3 min-h-[44px]">RESET PASSWORD</button>}
        {info?.active && <button disabled={busy} onClick={() => act("tenant_revoke")} className="btn-line px-3 min-h-[44px] text-red-700">REVOKE</button>}
      </div>
    </div>
  );
}
