"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { EventRow, StoredFile } from "@/lib/society";
import { deleteFile, listFiles, uploadFile } from "@/lib/ledgerClient";

const EMPTY = { title: "", event_date: "", type: "", description: "" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date TBD");

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

export default function EventsTab() {
  const [events, setEvents] = useState<EventRow[]>([]);
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
    setEvents((data as EventRow[]) || []);
  }
  async function loadPhotos(id: string) {
    try { const files = await listFiles(`events/${id}`); setPhotos((p) => ({ ...p, [id]: files })); } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
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

  const clean = (o: typeof EMPTY) => ({ title: o.title.trim(), event_date: o.event_date || null, type: o.type.trim() || null, description: o.description.trim() || null });

  async function add() {
    if (!form.title.trim()) { setError("Enter an event title"); return; }
    setBusy("add"); setError("");
    const { error } = await supabase.from("events").insert([clean(form)]);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setForm(EMPTY); load();
  }
  async function saveEdit() {
    if (!editId || !edit.title.trim()) return;
    setBusy("edit"); setError("");
    const { error } = await supabase.from("events").update(clean(edit)).eq("id", editId);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setEditId(null); load();
  }
  async function remove(e: EventRow) {
    const n = photos[e.id]?.length || 0;
    if (!confirm(`Delete event "${e.title}"${n ? ` and its ${n} photo${n > 1 ? "s" : ""}` : ""}?`)) return;
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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.event_date || "") >= today).sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
  const past = events.filter((e) => !e.event_date || e.event_date < today);

  const Card = ({ e, isPast }: { e: EventRow; isPast: boolean }) => {
    const pics = photos[e.id] || [];
    const open = openId === e.id;
    return (
      <div className={`border rounded-[4px] bg-[var(--surface)] ${open ? "border-[var(--gold)]" : "border-[var(--border)]"}`}>
        <button onClick={() => setOpenId(open ? null : e.id)} className="w-full text-left p-4 flex gap-4 items-start">
          <div className={`shrink-0 w-[64px] text-center border ${isPast ? "border-[var(--border)] bg-[var(--bg)]" : "border-[var(--navy)] bg-[var(--navy)] text-white"} py-2`}>
            <div className="mono text-[10px] tracking-[0.1em]">{e.event_date ? new Date(e.event_date).toLocaleDateString("en-IN", { month: "short" }).toUpperCase() : "TBD"}</div>
            <div className="serif text-[22px] leading-none">{e.event_date ? new Date(e.event_date).getDate() : "—"}</div>
            <div className="mono text-[9px] opacity-70">{e.event_date ? new Date(e.event_date).getFullYear() : ""}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="serif text-[16px] font-bold">{e.title}</div>
              {e.type && <span className="mono text-[9px] tracking-[0.12em] border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5">{e.type.toUpperCase()}</span>}
            </div>
            {e.description && <div className="text-[13px] opacity-80 mt-1">{e.description}</div>}
            <div className="mono text-[10px] opacity-60 mt-2">{fmt(e.event_date)} • 📷 {pics.length} photo{pics.length === 1 ? "" : "s"} • {open ? "click to close" : "click to open"}</div>
          </div>
          {pics[0] && !open && <img src={pics[0].url} alt="" className="hidden sm:block h-16 w-24 object-cover border border-[var(--border)] shrink-0" loading="lazy" />}
        </button>

        {open && (
          <div className="border-t border-[var(--border)] p-4 space-y-4">
            {editId === e.id ? (
              <div className="grid sm:grid-cols-2 gap-2 mono text-[11px] border border-[var(--gold)] bg-[#fffdf5] p-3">
                <input className="field sm:col-span-2" value={edit.title} onChange={(x) => setEdit({ ...edit, title: x.target.value })} placeholder="Title" />
                <input className="field" type="date" value={edit.event_date} onChange={(x) => setEdit({ ...edit, event_date: x.target.value })} />
                <input className="field" value={edit.type} onChange={(x) => setEdit({ ...edit, type: x.target.value })} placeholder="Type" />
                <input className="field sm:col-span-2" value={edit.description} onChange={(x) => setEdit({ ...edit, description: x.target.value })} placeholder="Details" />
                <div className="flex gap-2 sm:col-span-2">
                  <button onClick={saveEdit} disabled={busy === "edit"} className="btn-navy px-4 py-2 tracking-[0.1em]">{busy === "edit" ? "SAVING…" : "SAVE"}</button>
                  <button onClick={() => setEditId(null)} className="btn-line px-4 py-2">CANCEL</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <label className="btn-gold mono text-[11px] px-4 py-2 tracking-[0.06em] cursor-pointer">
                  {busy === `photos-${e.id}` ? progress || "UPLOADING…" : "📷 UPLOAD PHOTOS"}
                  <input type="file" hidden multiple accept="image/*" disabled={!!busy} onChange={(x) => { const fl = x.target.files; if (fl?.length) upload(e.id, fl); x.target.value = ""; }} />
                </label>
                <button onClick={() => { setEditId(e.id); setEdit({ title: e.title || "", event_date: e.event_date || "", type: e.type || "", description: e.description || "" }); }} className="btn-line mono text-[11px] px-4 py-2">EDIT EVENT</button>
                <button onClick={() => remove(e)} className="mono text-[11px] px-3 py-2 text-red-600 ml-auto">DELETE EVENT</button>
              </div>
            )}
            {pics.length === 0 ? (
              <div className="border border-dashed border-[var(--border)] p-6 text-center mono text-[11px] opacity-60">No photos yet. Select several photos at once with UPLOAD PHOTOS.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {pics.map((p, i) => (
                  <button key={p.key} onClick={() => setViewer({ list: pics, i })} className="aspect-square overflow-hidden border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--gold)]">
                    <img src={p.url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
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
          <div className="mono text-[11px] opacity-80 mt-1">Upcoming {upcoming.length} • Past {past.length} • Click an event to see or add photos</div>
        </div>
      </div>
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px] whitespace-pre-wrap">{error}</div>}

      <div>
        <div className="mono text-[10px] tracking-[0.2em] text-[var(--muted)] mb-2">UPCOMING</div>
        <div className="space-y-2">
          {upcoming.map((e) => <Card key={e.id} e={e} isPast={false} />)}
          {upcoming.length === 0 && <div className="mono text-[11px] opacity-60 border border-dashed border-[var(--border)] p-4">No upcoming events. Add one below.</div>}
        </div>
      </div>
      <div>
        <div className="mono text-[10px] tracking-[0.2em] text-[var(--muted)] mb-2">PAST</div>
        <div className="space-y-2">
          {past.map((e) => <Card key={e.id} e={e} isPast />)}
          {past.length === 0 && <div className="mono text-[11px] opacity-60">None</div>}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5">
        <div className="mono text-[11px] font-bold tracking-[0.12em]">+ ADD EVENT</div>
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mono text-[11px]">
          <input className="field" placeholder="Event title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="field" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          <input className="field" placeholder="Type (Festival, AGM…)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <button onClick={add} disabled={!!busy} className="btn-navy px-4 py-2 tracking-[0.1em]">{busy === "add" ? "SAVING…" : "ADD EVENT"}</button>
          <input className="field sm:col-span-2 lg:col-span-4" placeholder="Details" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setViewer(null)}>
          <div className="flex justify-between items-center p-3 text-white mono text-[12px]" onClick={(e) => e.stopPropagation()}>
            <span>{viewer.i + 1} / {viewer.list.length}</span>
            <div className="flex gap-3">
              <a href={viewer.list[viewer.i].url} target="_blank" rel="noopener noreferrer" className="underline">Open full size</a>
              <button onClick={() => { const id = viewer.list[viewer.i].key.split("/")[1]; removePhoto(id, viewer.list[viewer.i]); }} className="text-red-300">Delete</button>
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
