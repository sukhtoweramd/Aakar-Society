"use client";
// ADMIN → COMMON AREAS: the areas members can book for plot bookings (booking_areas). Add, rename, describe, put in order, hide, delete.
// Who may change them: the Chairman, the Secretary or the main admin (can_set_booking_charge(), the same people who set the charges);
// everyone else on the committee sees the list. Charges are set in the booking screen (BOOKING CHARGES), not here.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { rupees, sortAreas, type Area } from "@/lib/bookings";
import { AREA_DESC_MAX, AREA_NAME_MAX, areaDescError, areaNameError, canDeleteArea, moveArea, nextAreaSort } from "@/lib/areaSetup";

type Draft = { name: string; description: string; active: boolean };
const Label = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block min-w-0"><div className="mono text-[10px] tracking-[0.1em] opacity-60 mb-1">{t}</div>{children}</label>;

export default function BookingAreasPanel() {
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [canEdit, setCanEdit] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [add, setAdd] = useState({ name: "", description: "" });
  const [addErr, setAddErr] = useState("");

  async function load() {
    const a = await supabase.from("booking_areas").select("*").order("sort").order("name");
    if (a.error) { setMissing(true); setAreas([]); return; }
    const list = sortAreas((a.data as Area[]) || []);
    setAreas(list);
    setDrafts(Object.fromEntries(list.map((x) => [x.id, { name: x.name, description: x.description || "", active: x.active }])));
    const b = await supabase.from("bookings").select("area_id");
    const c: Record<string, number> = {};
    for (const r of (b.data as { area_id: string }[]) || []) c[r.area_id] = (c[r.area_id] || 0) + 1;
    setCounts(c);
  }
  useEffect(() => {
    load();
    supabase.rpc("can_set_booking_charge").then(({ data, error }) => setCanEdit(!error && data === true), () => setCanEdit(false));
  }, []);

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const fail = (text: string) => setMsg({ ok: false, text });

  async function save(a: Area) {
    const d = drafts[a.id];
    const bad = areaNameError(d.name, areas || [], a.id) || areaDescError(d.description);
    if (bad) { fail(bad); return; }
    const renamed = d.name.trim() !== a.name;
    const hiding = a.active && !d.active;
    if ((renamed || hiding) && !confirm([
      renamed ? `Rename "${a.name}" to "${d.name.trim()}"? Bookings already made keep the name they were made with.` : "",
      hiding ? `Hide "${a.name}"? Members can no longer book it. Existing bookings stay.` : "",
    ].filter(Boolean).join("\n\n"))) return;
    setBusy(a.id); setMsg(null);
    const { data, error } = await supabase.from("booking_areas").update({ name: d.name.trim(), description: d.description.trim() || null, active: d.active }).eq("id", a.id).select("id").maybeSingle();
    setBusy(null);
    if (error || !data) { fail(`Not saved: ${error?.message || "you do not have the right to change areas."}`); return; }
    await load();
    setMsg({ ok: true, text: `"${d.name.trim()}" saved.` });
  }
  async function move(a: Area, dir: -1 | 1) {
    const changes = moveArea(areas || [], a.id, dir);
    if (!changes.length) return;
    setBusy(a.id); setMsg(null);
    for (const c of changes) {
      const { data, error } = await supabase.from("booking_areas").update({ sort: c.sort }).eq("id", c.id).select("id").maybeSingle();
      if (error || !data) { setBusy(null); fail(`Not moved: ${error?.message || "you do not have the right to change areas."}`); await load(); return; }
    }
    setBusy(null);
    await load();
  }
  async function remove(a: Area) {
    if (!confirm(`Delete the area "${a.name}"? It has no bookings. This cannot be undone.`)) return;
    setBusy(a.id); setMsg(null);
    const { data, error } = await supabase.from("booking_areas").delete().eq("id", a.id).select("id");
    setBusy(null);
    if (error || !data || data.length === 0) { fail(`Not deleted: ${error?.message || "you do not have the right to change areas."}`); return; }
    await load();
    setMsg({ ok: true, text: `"${a.name}" deleted.` });
  }
  async function addArea() {
    const err = areaNameError(add.name, areas || []) || areaDescError(add.description);
    setAddErr(err);
    if (err) return;
    setBusy("add"); setMsg(null);
    const { error } = await supabase.from("booking_areas").insert([{ name: add.name.trim(), description: add.description.trim() || null, sort: nextAreaSort(areas || []), active: true }]);
    setBusy(null);
    if (error) { fail(`Not added: ${error.message}`); return; }
    setAdd({ name: "", description: "" });
    await load();
    setMsg({ ok: true, text: "Area added with no charge. Set its charge in BOOKING CHARGES (booking screen)." });
  }

  if (missing) return null; // the booking tables are not set up in this society yet
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 sm:p-6 min-w-0">
      <div className="serif text-[20px] sm:text-[22px] font-bold">COMMON AREAS (PLOT BOOKINGS)</div>
      <div className="mono text-[11px] opacity-60 mt-1">The areas members can book. Charges are set in the booking screen (BOOKING CHARGES).</div>
      {areas === null ? <div className="mt-4 mono text-[11px] opacity-60">Loading…</div> : (
        <div className="mt-4 grid gap-3">
          {areas.map((a, i) => {
            const d = drafts[a.id] || { name: a.name, description: a.description || "", active: a.active };
            const n = counts[a.id] || 0;
            const changed = d.name.trim() !== a.name || d.description.trim() !== (a.description || "") || d.active !== a.active;
            return (
              <div key={a.id} className={`border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 min-w-0 ${a.active ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><span className="serif text-[17px] font-bold break-words">{a.name}</span></div>
                  <span className="mono text-[10px] px-2 py-1 border border-[var(--border)] bg-white rounded-[2px]">{a.active ? "OPEN FOR BOOKING" : "HIDDEN"}</span>
                </div>
                <div className="mono text-[11px] mt-1.5 leading-relaxed">
                  {a.description ? <>{a.description}<br /></> : null}
                  Charge {rupees(Number(a.charge) || 0)} per day • {n} booking{n === 1 ? "" : "s"} so far
                </div>
                {canEdit && (
                  <div className="mt-3 grid gap-2.5 border-t border-[var(--border)] pt-3">
                    <Label t="NAME"><input className="field" value={d.name} maxLength={AREA_NAME_MAX} onChange={(e) => setDraft(a.id, { name: e.target.value })} /></Label>
                    <Label t="DESCRIPTION (OPTIONAL)"><input className="field" value={d.description} maxLength={AREA_DESC_MAX} onChange={(e) => setDraft(a.id, { description: e.target.value })} /></Label>
                    <label className="flex items-center gap-2 min-h-[44px] mono text-[11px]"><input type="checkbox" className="h-5 w-5" checked={d.active} onChange={(e) => setDraft(a.id, { active: e.target.checked })} /> Members can book this area</label>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => save(a)} disabled={!changed || busy !== null} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy === a.id ? "SAVING…" : "SAVE"}</button>
                      <button onClick={() => move(a, -1)} disabled={i === 0 || busy !== null} aria-label={`Move ${a.name} up`} className="btn-line mono text-[14px] px-4 min-h-[44px]">▲</button>
                      <button onClick={() => move(a, 1)} disabled={i === areas.length - 1 || busy !== null} aria-label={`Move ${a.name} down`} className="btn-line mono text-[14px] px-4 min-h-[44px]">▼</button>
                      {canDeleteArea(n) && <button onClick={() => remove(a)} disabled={busy !== null} className="btn-line mono text-[11px] px-4 min-h-[44px] text-red-700">DELETE</button>}
                    </div>
                    {!canDeleteArea(n) && <div className="mono text-[10px] opacity-60">It has bookings, so it cannot be deleted. Untick the box above to hide it instead.</div>}
                  </div>
                )}
              </div>
            );
          })}
          {areas.length === 0 && <div className="mono text-[11px] opacity-70">No areas yet.</div>}

          {canEdit && (
            <div className="border border-dashed border-[var(--border)] rounded-[3px] p-3 grid gap-2.5 min-w-0">
              <div className="mono text-[10px] tracking-[0.1em] font-bold opacity-70">ADD AN AREA</div>
              <Label t="NAME"><input className="field" placeholder="e.g. Club house" maxLength={AREA_NAME_MAX} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Label>
              <Label t="DESCRIPTION (OPTIONAL)"><input className="field" maxLength={AREA_DESC_MAX} value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} /></Label>
              {addErr && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5 mono text-[11px]">{addErr}</div>}
              <div><button onClick={addArea} disabled={busy !== null} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy === "add" ? "ADDING…" : "+ ADD AREA"}</button></div>
            </div>
          )}
          {!canEdit && <div className="mono text-[10px] opacity-60">Only the Chairman, the Secretary or the main admin can change the areas.</div>}
          {msg && <div className={`p-3 mono text-[11px] border ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
        </div>
      )}
    </div>
  );
}
