"use client";
// EVENTS → event → TEAM: the organising committee of one event (Navratri, SPL…).
// Committee login sets the convenor; the convenor adds the treasurer and team members.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, ownerText, residentName, sortFlats, type Flat } from "@/lib/society";
import { ROLE_ORDER, type EventRole, type TeamRow } from "@/lib/events";
import { isTenantRow, teamMemberName } from "@/lib/eventTeamRules";

export const teamName = (flats: Flat[], t: TeamRow) => teamMemberName(flats as any, t);

export default function EventTeam({ eventId, team, flats, isCommittee, myRole, onChanged }: { eventId: string; team: TeamRow[]; flats: Flat[]; isCommittee: boolean; myRole: EventRole | null; onChanged: () => void }) {
  const canManage = isCommittee || myRole === "Convenor";
  const roles: EventRole[] = isCommittee ? ["Convenor", "Treasurer", "Member", "Assisting"] : ["Treasurer", "Member", "Assisting"];
  // who is added: the flat's household (flat login) or the TENANT of a rented flat (tenant login, Assisting only)
  const [kind, setKind] = useState<"flat" | "tenant">("flat");
  const [flat, setFlat] = useState(""); const [person, setPerson] = useState(""); const [role, setRole] = useState<EventRole>(isCommittee && !team.some((t) => t.role === "Convenor") ? "Convenor" : "Member");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const list = [...team].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || teamName(flats, a).localeCompare(teamName(flats, b)));
  const free = [...flats].sort(sortFlats).filter((f) => (kind === "flat" || f.occupancy === "tenant") && !team.some((t) => t.flat_id === f.id && (t.member_kind || "flat") === kind));
  const canTouch = (t: TeamRow) => isCommittee || (myRole === "Convenor" && t.role !== "Convenor");

  async function add() {
    if (!flat) { setError("Choose the flat."); return; }
    setBusy(true); setError("");
    const row: any = { event_id: eventId, flat_id: flat, person: person.trim() || null, role: kind === "tenant" ? "Assisting" : role };
    if (kind === "tenant") row.member_kind = "tenant";
    const { error } = await supabase.from("event_team").insert([row]);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setFlat(""); setPerson(""); setRole("Member"); setKind("flat"); onChanged();
  }
  async function change(t: TeamRow, r: EventRole) {
    const { error } = await supabase.from("event_team").update({ role: r }).eq("id", t.id);
    if (error) setError(error.message); else onChanged();
  }
  async function remove(t: TeamRow) {
    if (!confirm(`Remove ${teamName(flats, t)} from the team?`)) return;
    const { error } = await supabase.from("event_team").delete().eq("id", t.id);
    if (error) setError(error.message); else onChanged();
  }

  return (
    <div className="mono text-[11px] space-y-3">
      <div className="opacity-60">{isCommittee ? "Choose a convenor first; the convenor can then add the treasurer and team members from their own flat login." : myRole === "Convenor" ? "As convenor you can add the treasurer and team members." : "The organising team for this event."}</div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-2">{error}</div>}
      {list.length === 0 ? <div className="border border-dashed border-[var(--border)] p-4 text-center opacity-60">No organising team yet.</div> : (
        <div className="grid sm:grid-cols-2 gap-2">
          {list.map((t) => { const f = flats.find((x) => x.id === t.flat_id); return (
            <div key={t.id} className="border border-[var(--border)] bg-[var(--bg)] p-2.5 flex items-center gap-2">
              <span className={`tag ${t.role === "Convenor" ? "bg-[var(--navy)] text-white" : t.role === "Treasurer" ? "bg-amber-50 text-amber-800" : "bg-[var(--surface)]"}`}>{t.role.toUpperCase()}</span>
              <div className="min-w-0 flex-1"><b className="text-[12px]">{teamName(flats, t)}</b><span className="opacity-60"> • {f ? label(f) : t.flat_id}{isTenantRow(t) ? " • tenant" : ""}</span></div>
              {canManage && canTouch(t) && <>
                {!isTenantRow(t) && <select className="field !w-auto !py-0.5 !text-[10px]" value={t.role} onChange={(e) => change(t, e.target.value as EventRole)} aria-label="Role">
                  {roles.map((r) => <option key={r}>{r}</option>)}</select>}
                <button onClick={() => remove(t)} className="text-red-600 px-1" title="Remove">✕</button></>}
            </div>); })}
        </div>)}
      {canManage && (
        <div className="flex flex-wrap gap-2 items-center border-t border-dashed border-[var(--border)] pt-3">
          <select className="field !w-auto" value={kind} onChange={(e) => { setKind(e.target.value as "flat" | "tenant"); setFlat(""); }} aria-label="Who">
            <option value="flat">Flat (owner's household)</option><option value="tenant">Tenant of a rented flat</option></select>
          <select className="field !w-auto min-w-[220px]" value={flat} onChange={(e) => setFlat(e.target.value)}><option value="">{kind === "tenant" ? "— rented flat —" : "— add flat —"}</option>
            {free.map((f) => <option key={f.id} value={f.id}>{label(f)} • {kind === "tenant" ? f.tenant_name || "Tenant" : residentName(f) || ownerText(f)}</option>)}</select>
          <input className="field !w-[200px]" placeholder="Person (if not the owner)" value={person} onChange={(e) => setPerson(e.target.value)} />
          {kind === "tenant"
            ? <span className="opacity-70">Role: Assisting (the tenant needs a tenant login)</span>
            : <select className="field !w-auto" value={role} onChange={(e) => setRole(e.target.value as EventRole)}>{roles.map((r) => <option key={r}>{r}</option>)}</select>}
          <button onClick={add} disabled={busy} className="btn-navy px-4 py-2">{busy ? "ADDING…" : "+ ADD TO TEAM"}</button>
        </div>)}
    </div>
  );
}
