"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { EventRow, StoredFile } from "@/lib/society";
import { deleteFile, listFiles, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";
import { loadTeams, type EventMoneySettings, type TeamRow } from "@/lib/events";
import { label, sortFlats } from "@/lib/society";
import type { Action, Meeting } from "@/lib/minutes";
import EventTeam, { teamName } from "./EventTeam";
import EventAccounts from "./EventAccounts";
import MinutesPanel from "./MinutesPanel";

type Ev = EventRow & Partial<EventMoneySettings>;
const SECTIONS = ["PHOTOS", "TEAM", "MINUTES", "ACCOUNTS"] as const;
type Section = (typeof SECTIONS)[number];

/** Minutes of one event's organising-team meetings (team sees drafts; everyone sees final). */
function EventMinutes({ ev, ctx, team, canEdit }: { ev: Ev; ctx: Ctx; team: TeamRow[]; canEdit: boolean }) {
  const [data, setData] = useState<{ meetings: Meeting[]; actions: Action[] } | null>(null);
  async function load() {
    const { data: m } = await supabase.from("meetings").select("*").eq("event_id", ev.id).order("meeting_date", { ascending: false });
    const ids = ((m as Meeting[]) || []).map((x) => x.id);
    const { data: a } = ids.length ? await supabase.from("meeting_actions").select("*").in("meeting_id", ids).order("due_date") : { data: [] };
    setData({ meetings: (m as Meeting[]) || [], actions: (a as Action[]) || [] });
  }
  useEffect(() => { load(); }, [ev.id]);
  if (!data) return <div className="mono text-[11px] opacity-60">Loading…</div>;
  const teamFlats = ctx.flats.filter((f) => team.some((t) => t.flat_id === f.id)).sort(sortFlats);
  return <MinutesPanel data={data} flats={ctx.flats} committee={teamFlats} email={ctx.email} onChanged={load} event={{ id: ev.id, title: ev.title || "Event" }} canEdit={canEdit} />;
}

const fmt = (x: string | null) => (x ? new Date(x + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date TBD");
const EMPTY = { title: "", event_date: "", end_date: "", type: "", description: "" };
const d = (s: string) => new Date(s + "T00:00:00");
/** "20 Oct 2026", "20–28 Oct 2026", "28 Sept – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027" */
function fmtRange(start: string | null, end?: string | null) {
  if (!start) return "Date TBD";
  if (!end || end <= start) return fmt(start);
  const a = d(start), b = d(end);
  const day = (x: Date) => x.getDate(), mon = (x: Date) => x.toLocaleDateString("en-IN", { month: "short" });
  if (a.getFullYear() !== b.getFullYear()) return `${fmt(start)} – ${fmt(end)}`;
  if (a.getMonth() !== b.getMonth()) return `${day(a)} ${mon(a)} – ${day(b)} ${mon(b)} ${b.getFullYear()}`;
  return `${day(a)}–${day(b)} ${mon(b)} ${b.getFullYear()}`;
}
const days = (start: string | null, end?: string | null) => (start && end && end > start ? Math.round((d(end).getTime() - d(start).getTime()) / 86400000) + 1 : 1);


/** Shrink big phone photos to max 2000px JPEG so they fit the 4 MB upload limit. */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic)/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function EventsTab({ ctx }: { ctx: Ctx }) {
  const canEdit = ctx.isCommittee;
  const [events, setEvents] = useState<Ev[]>([]);
  const [teams, setTeams] = useState<TeamRow[] | null>([]);
  const [sec, setSec] = useState<Record<string, Section>>({});
  const reloadTeams = () => loadTeams().then(setTeams);
  const roleIn = (id: string) => (teams || []).find((t) => t.event_id === id && !!ctx.homeFlat && t.flat_id === ctx.homeFlat)?.role || null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, StoredFile[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState(EMPTY);
  const [viewer, setViewer] = useState<{ list: StoredFile[]; i: number } | null>(null);

  async function load() {
    const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: false });
    if (error) setError(error.message);
    setEvents((data as Ev[]) || []);
  }
  async function loadPhotos(id: string) {
    try { const files = await listFiles(`events/${id}`); setPhotos((p) => ({ ...p, [id]: files })); } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); reloadTeams(); }, []);
  useEffect(() => { events.forEach((e) => loadPhotos(e.id)); }, [events.map((e) => e.id).join()]);

  useEffect(() => {
    if (!viewer) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewer((v) => v && { ...v, i: (v.i + 1) % v.list.length });
      if (e.key === "ArrowLeft") setViewer((v) => v && { ...v, i: (v.i - 1 + v.list.length) % v.list.length });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [viewer]);

  const hasEnd = events.length === 0 || "end_date" in events[0];
  const clean = (o: typeof EMPTY) => {
    const row: any = { title: o.title.trim(), event_date: o.event_date || null, type: o.type.trim() || null, description: o.description.trim() || null };
    if (o.end_date && o.event_date && o.end_date < o.event_date) throw new Error("The To date is before the From date.");
    if (hasEnd) row.end_date = o.end_date && o.end_date !== o.event_date ? o.end_date : null;
    else if (o.end_date) throw new Error("To date needs the one-line database step (end_date) to be run first.");
    return row;
  };

  async function add() {
    if (!form.title.trim()) { setError("Enter an event title"); return; }
    setBusy("add"); setError("");
    let row; try { row = clean(form); } catch (e: any) { setBusy(null); setError(e.message); return; }
    const { error } = await supabase.from("events").insert([row]);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setForm(EMPTY); load();
  }
  async function saveEdit() {
    if (!editId || !edit.title.trim()) return;
    setBusy("edit"); setError("");
    let row; try { row = clean(edit); } catch (e: any) { setBusy(null); setError(e.message); return; }
    const { error } = await supabase.from("events").update(row).eq("id", editId);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setEditId(null); load();
  }
  async function remove(e: EventRow) {
    const n = photos[e.id]?.length || 0;
    if (!confirm(`Delete event "${e.title}"${n ? ` and its ${n} photo${n > 1 ? "s" : ""}` : ""}?\n\nIts organising team, team minutes and event accounts will also be deleted.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", e.id);
    if (error) { setError(error.message); return; }
    for (const p of photos[e.id] || []) await deleteFile({ key: p.key }).catch(() => {});
    load();
  }
  async function upload(id: string, files: FileList) {
    setBusy(`photos-${id}`); setError("");
    const list = Array.from(files);
    let done = 0;
    const failed: string[] = [];
    for (const f of list) {
      setProgress(`Uploading ${done + 1} of ${list.length}…`);
      try { await uploadFile(await shrinkImage(f), `events/${id}`); } catch (e: any) { failed.push(`${f.name}: ${e.message}`); }
      done++;
    }
    setProgress("");
    if (failed.length) setError(`Some photos failed:\n${failed.join("\n")}`);
    await loadPhotos(id);
    setBusy(null);
  }
  async function removePhoto(id: string, p: StoredFile) {
    if (!confirm("Delete this photo?")) return;
    try { await deleteFile({ key: p.key }); await loadPhotos(id); setViewer(null); } catch (e: any) { setError(e.message); }
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; // local (IST) date
  const lastDay = (e: EventRow) => e.end_date || e.event_date || "";
  const ongoing = events.filter((e) => e.event_date && e.event_date <= today && lastDay(e) >= today);
  const upcoming = events.filter((e) => (e.event_date || "") > today).sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
  const past = events.filter((e) => !e.event_date || lastDay(e) < today);

  // Called as a function (not <Card/>) so the open event's screens keep their state when this tab re-renders.
  const Card = ({ e, isPast }: { e: Ev; isPast: boolean }) => {
    const pics = photos[e.id] || [];
    const open = openId === e.id;
    const myRole = roleIn(e.id);
    const team = (teams || []).filter((t) => t.event_id === e.id);
    const convenor = team.find((t) => t.role === "Convenor");
    const canPhotos = canEdit || myRole === "Convenor";
    const section: Section = sec[e.id] || "PHOTOS";
    return (
      <div className={`border rounded-[4px] bg-[var(--surface)] ${open ? "border-[var(--gold)]" : "border-[var(--border)]"}`}>
        <button onClick={() => setOpenId(open ? null : e.id)} className="w-full text-left p-4 flex gap-4 items-start">
          <div className={`shrink-0 w-[64px] text-center border ${isPast ? "border-[var(--border)] bg-[var(--bg)]" : "border-[var(--navy)] bg-[var(--navy)] text-white"} py-2`}>
            <div className="mono text-[10px] tracking-[0.1em]">{e.event_date ? d(e.event_date).toLocaleDateString("en-IN", { month: "short" }).toUpperCase() : "TBD"}</div>
            <div className="serif text-[22px] leading-none">{e.event_date ? d(e.event_date).getDate() : "—"}</div>
            <div className="mono text-[9px] opacity-70">{e.event_date ? (days(e.event_date, e.end_date) > 1 ? `${days(e.event_date, e.end_date)} DAYS` : d(e.event_date).getFullYear()) : ""}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="serif text-[16px] font-bold">{e.title}</div>
              {e.type && <span className="mono text-[9px] tracking-[0.12em] border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5">{e.type.toUpperCase()}</span>}
              {e.event_date && e.event_date <= today && lastDay(e) >= today && <span className="mono text-[9px] tracking-[0.12em] bg-emerald-600 text-white px-1.5 py-0.5">● ON NOW</span>}
            </div>
            {e.description && <div className="text-[13px] opacity-80 mt-1">{e.description}</div>}
            {convenor && <div className="mono text-[10.5px] mt-1.5">Convenor <b>{teamName(ctx.flats, convenor)}</b>{(() => { const f = ctx.flats.find((x) => x.id === convenor.flat_id); return f ? ` • ${label(f)}` : ""; })()} • team of {team.length}{myRole ? <span className="ml-1.5 tag bg-[var(--gold)] text-[var(--navy)]">YOU: {myRole.toUpperCase()}</span> : null}</div>}
            <div className="mono text-[10px] opacity-60 mt-2">{fmtRange(e.event_date, e.end_date)} • 📷 {pics.length} photo{pics.length === 1 ? "" : "s"} • {open ? "click to close" : "click to open"}</div>
          </div>
          {pics[0] && !open && <img src={pics[0].url} alt="" className="hidden sm:block h-16 w-24 object-cover border border-[var(--border)] shrink-0" loading="lazy" />}
        </button>

        {open && (
          <div className="border-t border-[var(--border)] p-4 space-y-4">
            {teams !== null && <div className="flex flex-wrap gap-1.5 mono text-[11px]">
              {SECTIONS.map((v) => <button key={v} onClick={() => setSec((x) => ({ ...x, [e.id]: v }))} className={`px-3 py-1.5 border ${section === v ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "border-[var(--border)] bg-[var(--bg)]"}`}>{v === "TEAM" ? `TEAM${team.length ? ` • ${team.length}` : ""}` : v}</button>)}
            </div>}
            {section === "TEAM" && <EventTeam eventId={e.id} team={team} flats={ctx.flats} isCommittee={ctx.isCommittee} myRole={myRole} onChanged={reloadTeams} />}
            {section === "MINUTES" && <EventMinutes ev={e} ctx={ctx} team={team} canEdit={ctx.isCommittee || myRole === "Convenor"} />}
            {section === "ACCOUNTS" && <EventAccounts ev={e} flats={ctx.flats} team={team} isCommittee={ctx.isCommittee} myRole={myRole} email={ctx.email} onSettings={load} />}
            {section === "PHOTOS" && <>
            {editId === e.id ? (
              <div className="grid sm:grid-cols-2 gap-2 mono text-[11px] border border-[var(--gold)] bg-[#fffdf5] p-3">
                <input className="field sm:col-span-2" value={edit.title} onChange={(x) => setEdit({ ...edit, title: x.target.value })} placeholder="Title" />
                <label className="flex items-center gap-2"><span className="w-10 opacity-60">FROM</span><input className="field" type="date" value={edit.event_date} onChange={(x) => setEdit({ ...edit, event_date: x.target.value })} /></label>
                <label className="flex items-center gap-2"><span className="w-10 opacity-60">TO</span><input className="field" type="date" min={edit.event_date || undefined} value={edit.end_date} onChange={(x) => setEdit({ ...edit, end_date: x.target.value })} /></label>
                <input className="field" value={edit.type} onChange={(x) => setEdit({ ...edit, type: x.target.value })} placeholder="Type" />
                <input className="field sm:col-span-2" value={edit.description} onChange={(x) => setEdit({ ...edit, description: x.target.value })} placeholder="Details" />
                <div className="flex gap-2 sm:col-span-2">
                  <button onClick={saveEdit} disabled={busy === "edit"} className="btn-navy px-4 py-2 tracking-[0.1em]">{busy === "edit" ? "SAVING…" : "SAVE"}</button>
                  <button onClick={() => setEditId(null)} className="btn-line px-4 py-2">CANCEL</button>
                </div>
              </div>
            ) : canPhotos && (
              <div className="flex flex-wrap gap-2">
                <label className="btn-gold mono text-[11px] px-4 py-2 tracking-[0.06em] cursor-pointer">
                  {busy === `photos-${e.id}` ? progress || "UPLOADING…" : "📷 UPLOAD PHOTOS"}
                  <input type="file" hidden multiple accept="image/*" disabled={!!busy} onChange={(x) => { const fl = x.target.files; if (fl?.length) upload(e.id, fl); x.target.value = ""; }} />
                </label>
                {canEdit && <><button onClick={() => { setEditId(e.id); setEdit({ title: e.title || "", event_date: e.event_date || "", end_date: e.end_date || "", type: e.type || "", description: e.description || "" }); }} className="btn-line mono text-[11px] px-4 py-2">EDIT EVENT</button>
                <button onClick={() => remove(e)} className="mono text-[11px] px-3 py-2 text-red-600 ml-auto">DELETE EVENT</button></>}
              </div>
            )}
            {pics.length === 0 ? (
              <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[11px] opacity-60">{canPhotos ? "No photos yet. Select several photos at once with UPLOAD PHOTOS." : "No photos for this event yet."}</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {pics.map((p, i) => (
                  <button key={p.key} onClick={() => setViewer({ list: pics, i })} className="aspect-square overflow-hidden border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--gold)]">
                    <img src={p.url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            </>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--navy)] text-[#fdfcf5] rounded-[4px] p-5 flex flex-wrap justify-between gap-3">
        <div>
          <div className="serif text-[22px] font-bold">Society Events & Photo Gallery</div>
          <div className="mono text-[11px] opacity-80 mt-1">{ongoing.length ? `On now ${ongoing.length} • ` : ""}Upcoming {upcoming.length} • Past {past.length} • {canEdit ? "Click an event for photos, organising team, minutes and accounts" : "Click an event to see its photos, team and minutes"}</div>
        </div>
      </div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px] whitespace-pre-wrap">{error}</div>}

      {ongoing.length > 0 && <div>
        <div className="mono text-[10px] tracking-[0.2em] text-emerald-700 mb-2">● HAPPENING NOW</div>
        <div className="space-y-2">{ongoing.map((e) => <div key={e.id}>{Card({ e, isPast: false })}</div>)}</div>
      </div>}
      <div>
        <div className="mono text-[10px] tracking-[0.2em] text-[var(--muted)] mb-2">UPCOMING</div>
        <div className="space-y-2">
          {upcoming.map((e) => <div key={e.id}>{Card({ e, isPast: false })}</div>)}
          {upcoming.length === 0 && <div className="mono text-[11px] opacity-60 border border-dashed border-[var(--border)] p-4">No upcoming events. Add one below.</div>}
        </div>
      </div>
      <div>
        <div className="mono text-[10px] tracking-[0.2em] text-[var(--muted)] mb-2">PAST</div>
        <div className="space-y-2">
          {past.map((e) => <div key={e.id}>{Card({ e, isPast: true })}</div>)}
          {past.length === 0 && <div className="mono text-[11px] opacity-60">None</div>}
        </div>
      </div>

      {canEdit && <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5">
        <div className="mono text-[11px] font-bold tracking-[0.12em]">+ ADD EVENT <span className="font-normal opacity-60">• leave TO empty for a one-day event</span></div>
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2 mono text-[11px]">
          <input className="field" placeholder="Event title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="flex items-center gap-2"><span className="opacity-60 w-10">FROM</span><input className="field" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></label>
          <label className="flex items-center gap-2"><span className="opacity-60 w-10">TO</span><input className="field" type="date" min={form.event_date || undefined} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <input className="field" placeholder="Type (Festival, AGM…)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <button onClick={add} disabled={!!busy} className="btn-navy px-4 py-2 tracking-[0.1em]">{busy === "add" ? "SAVING…" : "ADD EVENT"}</button>
          <input className="field sm:col-span-2 lg:col-span-5" placeholder="Details" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>}

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex justify-between items-center p-3 text-white mono text-[12px]" onClick={(e) => e.stopPropagation()}>
            <span>{viewer.i + 1} / {viewer.list.length}</span>
            <div className="flex gap-3">
              <a href={viewer.list[viewer.i].url} target="_blank" rel="noopener noreferrer" className="underline">Open full size</a>
              {(canEdit || roleIn(viewer.list[viewer.i].key.split("/")[1]) === "Convenor") && <button onClick={() => { const id = viewer.list[viewer.i].key.split("/")[1]; removePhoto(id, viewer.list[viewer.i]); }} className="text-red-300">Delete</button>}
              <button onClick={() => setViewer(null)} className="text-[18px] leading-none">✕</button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-between gap-2 px-2 min-h-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewer({ ...viewer, i: (viewer.i - 1 + viewer.list.length) % viewer.list.length })} className="text-white text-[32px] px-3">‹</button>
            <img src={viewer.list[viewer.i].url} alt="" className="max-h-full max-w-[85vw] object-contain" />
            <button onClick={() => setViewer({ ...viewer, i: (viewer.i + 1) % viewer.list.length })} className="text-white text-[32px] px-3">›</button>
          </div>
        </div>
      )}
    </div>
  );
}
