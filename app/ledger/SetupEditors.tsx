"use client";
// ADMIN → FLAT SETUP: the society details and the towers, with editing for the main admin (19 Nov 2026).
// Who may save is decided by the database (is_main_admin() in the rules of society_profile and towers, FLAT_SETUP_TABLES.sql);
// the buttons are only hidden for everyone else. A tower that flats use keeps its code, its terrace setting and stays on.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SOCIETY } from "@/lib/society";
import { applySocietyProfile, profileFromRow, writeCachedProfile } from "@/lib/societySetup";
import { newTowerError, nextTowerSort, profileToForm, towerNameError, validateProfile, type ProfileForm } from "@/lib/setupEdit";
import { towerViews } from "@/lib/setupView";
import type { Ctx } from "./ctx";

/** true = this login is the main admin (the database says so); false / null = not, or not known yet. */
export function useIsMainAdmin() {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    let off = false;
    supabase.rpc("is_main_admin").then(({ data, error }) => { if (!off) setV(!error && data === true); }, () => { if (!off) setV(false); });
    return () => { off = true; };
  }, []);
  return v;
}

export const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="py-2.5 border-b border-[var(--border)] last:border-0 min-w-0">
    <div className="mono text-[10px] tracking-[0.1em] opacity-60">{k}</div>
    <div className="text-[14px] font-semibold break-words">{v || "—"}</div>
  </div>
);
const Chip = ({ children }: { children: React.ReactNode }) => <span className="mono text-[10px] px-2 py-1 border border-[var(--border)] bg-white rounded-[2px]">{children}</span>;
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => m ? <div className={`mt-3 p-3 mono text-[11px] border ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{m.text}</div> : null;
const Label = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block min-w-0"><div className="mono text-[10px] tracking-[0.1em] opacity-60 mb-1">{t}</div>{children}</label>;

/** SOCIETY part: the details, and (main admin) an edit form. */
export function SocietyDetails({ ctx }: { ctx: Ctx }) {
  const main = useIsMainAdmin();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof ProfileForm, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    const r = validateProfile(form);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors([]);
    if (!confirm("Save the society details?\n\nThey are printed on bills, receipts and letters from now on. Documents already printed do not change.")) return;
    setBusy(true); setMsg(null);
    // Update this society's row; insert it only when there is none yet. (No upsert: the key is (society_id, id) since MT_06,
    // and an update-then-insert works with the old key and the new one alike.)
    const payload = { ...r.row, updated_by: ctx.email, updated_at: new Date().toISOString() };
    let { data, error } = await supabase.from("society_profile").update(payload).eq("id", 1).select("*").maybeSingle();
    if (!error && !data) {
      ({ data, error } = await supabase.from("society_profile").insert({ id: 1, ...payload }).select("*").maybeSingle());
    }
    setBusy(false);
    if (error || !data) { setMsg({ ok: false, text: `Not saved: ${error?.message || "only the main admin login can change this."}` }); return; }
    const prof = profileFromRow(data);
    applySocietyProfile(prof);
    try { writeCachedProfile(window.localStorage, prof); } catch { /* ignore */ }
    await ctx.reloadSetup();
    setForm(null);
    setMsg({ ok: true, text: "Saved. The new details show on every screen and on the next bills, receipts and letters." });
  }

  if (form) return (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-4 grid gap-3 min-w-0">
      <Label t="SOCIETY NAME *"><input className="field" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Label>
      <Label t="FULL NAME (PRINTED ON LETTERS AND BILLS) *"><input className="field" value={form.full} maxLength={120} onChange={(e) => set("full", e.target.value)} /></Label>
      <div className="grid sm:grid-cols-2 gap-3">
        <Label t="REGISTRATION NO."><input className="field" value={form.reg} maxLength={40} onChange={(e) => set("reg", e.target.value)} /></Label>
        <Label t="REGISTERED ON (AS PRINTED, E.G. 16-03-1994)"><input className="field" value={form.regDate} maxLength={20} onChange={(e) => set("regDate", e.target.value)} /></Label>
      </div>
      <Label t="BUILDING"><input className="field" value={form.building} maxLength={60} onChange={(e) => set("building", e.target.value)} /></Label>
      <Label t="ADDRESS"><input className="field" value={form.address} maxLength={200} onChange={(e) => set("address", e.target.value)} /></Label>
      <Label t="ADDRESS LINES (ONE PER LINE, AT MOST 4: LOGIN AND COVER SCREENS)"><textarea className="field" rows={3} value={form.lines} onChange={(e) => set("lines", e.target.value)} /></Label>
      <Label t="CITY"><input className="field" value={form.city} maxLength={60} onChange={(e) => set("city", e.target.value)} /></Label>
      {errors.length > 0 && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px] space-y-1">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy} className="btn-navy mono text-[12px] tracking-[0.1em] px-6 min-h-[44px]">{busy ? "SAVING…" : "SAVE"}</button>
        <button onClick={() => { setForm(null); setErrors([]); }} disabled={busy} className="btn-line mono text-[11px] px-4 min-h-[44px]">CANCEL</button>
      </div>
    </div>
  );

  return (
    <div className="mt-4">
      <div className="border border-[var(--border)] bg-[var(--bg)] rounded-[3px] px-4">
        <Row k="SOCIETY NAME" v={SOCIETY.name} />
        <Row k="FULL NAME (PRINTED ON LETTERS AND BILLS)" v={SOCIETY.full} />
        <Row k="REGISTRATION NO." v={SOCIETY.reg} />
        <Row k="REGISTERED ON" v={SOCIETY.regDate} />
        <Row k="BUILDING" v={SOCIETY.building} />
        <Row k="ADDRESS" v={SOCIETY.address} />
        <Row k="ADDRESS LINES (LOGIN AND COVER SCREENS)" v={SOCIETY.addressLines.join(" • ")} />
        <Row k="CITY" v={SOCIETY.city} />
      </div>
      {main === true && <button onClick={() => { setForm(profileToForm(SOCIETY)); setMsg(null); }} className="btn-line mono text-[11px] font-semibold tracking-[0.08em] px-4 min-h-[44px] mt-3">EDIT SOCIETY DETAILS</button>}
      {main === false && <div className="mono text-[10px] opacity-60 mt-3">Only the main admin login can change these.</div>}
      <Msg m={msg} />
    </div>
  );
}

type TowerRow = { code: string; name: string; has_terrace: boolean; sort: number; active: boolean };
type Draft = { name: string; terrace: boolean; active: boolean };

/** TOWERS part: every tower with its flats, and (main admin) rename / terrace / on-off / add / delete. */
export function TowerEditor({ ctx }: { ctx: Ctx }) {
  const main = useIsMainAdmin();
  const [rows, setRows] = useState<TowerRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [add, setAdd] = useState({ code: "", name: "", terrace: false });
  const [addErr, setAddErr] = useState("");

  async function load() {
    const { data, error } = await supabase.from("towers").select("*").order("sort").order("code");
    if (error) { setMsg({ ok: false, text: `Could not load the towers: ${error.message}` }); setRows([]); return; }
    const list = ((data || []) as any[]).map((r) => ({ code: r.code, name: r.name, has_terrace: !!r.has_terrace, sort: Number(r.sort) || 0, active: r.active !== false }));
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.code, { name: r.name, terrace: r.has_terrace, active: r.active }])));
  }
  useEffect(() => { load(); }, []);

  const views = towerViews(ctx.flats, (rows || []).map((r) => ({ code: r.code, name: r.name, terrace: r.has_terrace })));
  const countOf = (code: string) => views.find((v) => v.code === code);
  const setDraft = (code: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [code]: { ...d[code], ...patch } }));
  const after = async () => { await load(); await ctx.reloadSetup(); };

  async function saveRow(r: TowerRow) {
    const d = drafts[r.code];
    const bad = towerNameError(d.name);
    if (bad) { setMsg({ ok: false, text: bad }); return; }
    setBusy(r.code); setMsg(null);
    const { data, error } = await supabase.from("towers")
      .update({ name: d.name.trim(), has_terrace: d.terrace, active: d.active, updated_by: ctx.email, updated_at: new Date().toISOString() })
      .eq("code", r.code).select("code").maybeSingle();
    setBusy(null);
    if (error || !data) { setMsg({ ok: false, text: `Not saved: ${error?.message || "only the main admin login can change this."}` }); return; }
    await after();
    setMsg({ ok: true, text: `Tower ${r.code} saved.` });
  }
  async function removeRow(r: TowerRow) {
    if (!confirm(`Delete tower ${r.code} (${r.name})? It has no flats. This cannot be undone.`)) return;
    setBusy(r.code); setMsg(null);
    const { error } = await supabase.from("towers").delete().eq("code", r.code);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: `Not deleted: ${error.message}` }); return; }
    await after();
    setMsg({ ok: true, text: `Tower ${r.code} deleted.` });
  }
  async function addTower() {
    const err = newTowerError(add.code, add.name, rows || []);
    setAddErr(err);
    if (err) return;
    setBusy("add"); setMsg(null);
    const { error } = await supabase.from("towers").insert([{ code: add.code.trim(), name: add.name.trim(), has_terrace: add.terrace, sort: nextTowerSort(rows || []), active: true, updated_by: ctx.email }]);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: `Not added: ${error.message}` }); return; }
    setAdd({ code: "", name: "", terrace: false });
    await after();
    setMsg({ ok: true, text: "Tower added. It has no flats yet." });
  }

  if (rows === null) return <div className="mt-4 mono text-[11px] opacity-60">Loading towers…</div>;
  return (
    <div className="mt-4 grid gap-3">
      {rows.map((r) => {
        const v = countOf(r.code);
        const used = !!v && v.flats > 0;
        const d = drafts[r.code] || { name: r.name, terrace: r.has_terrace, active: r.active };
        const changed = d.name.trim() !== r.name || d.terrace !== r.has_terrace || d.active !== r.active;
        return (
          <div key={r.code} className={`border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 min-w-0 ${r.active ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><span className="serif text-[18px] font-bold">{r.name}</span> <span className="mono text-[11px] opacity-60">code {r.code}</span></div>
              <div className="flex flex-wrap gap-1.5">{used && <Chip>IN USE • LOCKED</Chip>}{!r.active && <Chip>SWITCHED OFF</Chip>}</div>
            </div>
            <div className="mono text-[11px] mt-2 leading-relaxed">
              {v?.flats || 0} flat{v?.flats === 1 ? "" : "s"}{v && v.firstFloor != null ? ` • floors ${v.firstFloor} to ${v.lastFloor}` : ""}<br />
              Top floor terrace: <b>{r.has_terrace ? "Yes" : "No"}</b>
            </div>
            {main === true && (
              <div className="mt-3 grid gap-2.5 border-t border-[var(--border)] pt-3">
                <Label t="DISPLAY NAME"><input className="field" value={d.name} maxLength={60} onChange={(e) => setDraft(r.code, { name: e.target.value })} /></Label>
                <label className={`flex items-center gap-2 min-h-[44px] mono text-[11px] ${used ? "opacity-50" : ""}`}>
                  <input type="checkbox" className="h-5 w-5" checked={d.terrace} disabled={used} onChange={(e) => setDraft(r.code, { terrace: e.target.checked })} /> Top floor has a terrace (higher maintenance){used ? " — locked, flats use it" : ""}
                </label>
                <label className={`flex items-center gap-2 min-h-[44px] mono text-[11px] ${used ? "opacity-50" : ""}`}>
                  <input type="checkbox" className="h-5 w-5" checked={d.active} disabled={used} onChange={(e) => setDraft(r.code, { active: e.target.checked })} /> Tower is in use (shown in lists){used ? " — locked, flats use it" : ""}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => saveRow(r)} disabled={!changed || busy !== null} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy === r.code ? "SAVING…" : "SAVE"}</button>
                  {!used && <button onClick={() => removeRow(r)} disabled={busy !== null} className="btn-line mono text-[11px] px-4 min-h-[44px] text-red-700">DELETE TOWER</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {rows.length === 0 && <div className="mono text-[11px] opacity-70">No towers are set up yet.</div>}

      {main === true && (
        <div className="border border-dashed border-[var(--border)] rounded-[3px] p-3 grid gap-2.5 min-w-0">
          <div className="mono text-[10px] tracking-[0.1em] font-bold opacity-70">ADD A TOWER (OR WING)</div>
          <div className="grid sm:grid-cols-[120px_1fr] gap-2.5">
            <Label t="CODE"><input className="field" placeholder="A" maxLength={10} value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} /></Label>
            <Label t="DISPLAY NAME"><input className="field" placeholder="Tower A" maxLength={60} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Label>
          </div>
          <label className="flex items-center gap-2 min-h-[44px] mono text-[11px]"><input type="checkbox" className="h-5 w-5" checked={add.terrace} onChange={(e) => setAdd({ ...add, terrace: e.target.checked })} /> Top floor has a terrace</label>
          {addErr && <div className="border border-red-200 bg-red-50 text-red-700 p-2.5 mono text-[11px]">{addErr}</div>}
          <div><button onClick={addTower} disabled={busy !== null} className="btn-navy mono text-[12px] tracking-[0.1em] px-5 min-h-[44px]">{busy === "add" ? "ADDING…" : "+ ADD TOWER"}</button></div>
        </div>
      )}
      {main === false && <div className="mono text-[10px] opacity-60">Only the main admin login can change the towers.</div>}
      <Msg m={msg} />
    </div>
  );
}
