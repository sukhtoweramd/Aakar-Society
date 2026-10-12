"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { EventRow, Notice } from "@/lib/society";
import { deleteFile, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";

export default function NoticesTab({ ctx }: { ctx: Ctx }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [n, setN] = useState({ title: "", content: "", tower: "Common" });
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [ev, setEv] = useState({ title: "", event_date: "", type: "", description: "" });

  async function load() {
    const [a, b] = await Promise.all([
      supabase.from("notices").select("*").order("created_at", { ascending: false }),
      supabase.from("events").select("*").order("event_date", { ascending: false }),
    ]);
    if (a.error || b.error) setError((a.error || b.error)!.message);
    setNotices((a.data as Notice[]) || []);
    setEvents((b.data as EventRow[]) || []);
  }
  useEffect(() => { load(); }, []);

  async function publish() {
    if (!n.title.trim()) { setError("Enter a notice title"); return; }
    setBusy("notice"); setError("");
    try {
      const url = file ? (await uploadFile(file, "notices")).url : null;
      const { error } = await supabase.from("notices").insert([{ title: n.title.trim(), content: n.content.trim() || null, tower: n.tower, file_url: url, created_by: ctx.email }]);
      if (error) throw error;
      setN({ title: "", content: "", tower: "Common" }); setFile(null); setFileKey((k) => k + 1); load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function removeNotice(x: Notice) {
    if (!confirm(`Delete notice "${x.title}"?`)) return;
    const { error } = await supabase.from("notices").delete().eq("id", x.id);
    if (error) { setError(error.message); return; }
    if (x.file_url) deleteFile({ url: x.file_url }).catch(() => {});
    load();
  }
  async function addEvent() {
    if (!ev.title.trim()) { setError("Enter an event title"); return; }
    setBusy("event"); setError("");
    const { error } = await supabase.from("events").insert([{ title: ev.title.trim(), event_date: ev.event_date || null, type: ev.type.trim() || null, description: ev.description.trim() || null }]);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setEv({ title: "", event_date: "", type: "", description: "" }); load();
  }
  async function removeEvent(x: EventRow) {
    if (!confirm(`Delete event "${x.title}"?`)) return;
    const { error } = await supabase.from("events").delete().eq("id", x.id);
    if (error) setError(error.message); else load();
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.event_date || "") >= today).reverse();
  const past = events.filter((e) => !e.event_date || e.event_date < today);

  return (
    <div className="space-y-4 fade-in">
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
      <div className="grid xl:grid-cols-[1.3fr_1fr] gap-4 items-start">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
          <div className="serif text-[22px] font-bold">Society Notices</div>
          <div className="mono text-[11px] opacity-60">{notices.length} notices • Common + tower-wise • Attachments stored in R2</div>
          <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-4 space-y-2 mono text-[11px]">
            <div className="grid sm:grid-cols-[1fr_140px] gap-2">
              <input className="field" placeholder="Notice title *" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
              <select className="field" value={n.tower} onChange={(e) => setN({ ...n, tower: e.target.value })}>
                <option value="Common">All towers</option><option value="A">Tower A</option><option value="B">Tower B</option><option value="C">Tower C</option>
              </select>
            </div>
            <textarea className="field" rows={3} placeholder="Type notice…" value={n.content} onChange={(e) => setN({ ...n, content: e.target.value })} />
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <input key={fileKey} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px]" />
              <button onClick={publish} disabled={!!busy} className="btn-navy px-5 py-2 tracking-[0.1em]">{busy === "notice" ? "PUBLISHING…" : "PUBLISH"}</button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {notices.map((x) => (
              <div key={x.id} className="border border-[var(--border)] bg-[var(--surface)] p-4 flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="serif text-[15px] font-bold">{x.title}</div>
                    <span className="mono text-[9px] tracking-[0.12em] border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5">{!x.tower || /common|all/i.test(x.tower) ? "ALL TOWERS" : `TOWER ${x.tower.replace(/tower\s*/i, "")}`}</span>
                  </div>
                  {x.content && <div className="text-[13px] opacity-80 mt-1 whitespace-pre-wrap">{x.content}</div>}
                  <div className="mono text-[10px] opacity-50 mt-2">
                    {new Date(x.created_at).toLocaleString("en-IN")}{x.created_by ? ` • ${x.created_by}` : ""}
                    {x.file_url && <a href={x.file_url} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-[var(--navy)] opacity-100">📎 View file</a>}
                  </div>
                </div>
                <button onClick={() => removeNotice(x)} className="mono text-[10px] text-red-600 self-start shrink-0">DELETE</button>
              </div>
            ))}
            {notices.length === 0 && <div className="mono text-[11px] opacity-60">No notices yet.</div>}
          </div>
        </div>

        <div className="bg-[var(--navy)] text-[#fdfcf5] rounded-[4px] p-6">
          <div className="serif text-[20px] font-bold">Events</div>
          <div className="mono text-[11px] opacity-70">Upcoming {upcoming.length} • Past {past.length}</div>
          {[["UPCOMING", upcoming], ["PAST", past]].map(([title, rows]) => (
            <div key={title as string} className="mt-4">
              <div className="mono text-[10px] tracking-[0.2em] text-[var(--gold)]">{title as string}</div>
              <div className="mt-2 space-y-2">
                {(rows as EventRow[]).map((e) => (
                  <div key={e.id} className="border border-white/15 bg-white/5 p-3 flex justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[13px]">{e.title}</div>
                      <div className="mono text-[10px] opacity-70">{e.event_date ? new Date(e.event_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date TBD"}{e.type ? ` • ${e.type}` : ""}</div>
                      {e.description && <div className="text-[12px] opacity-80 mt-1">{e.description}</div>}
                    </div>
                    <button onClick={() => removeEvent(e)} className="mono text-[10px] text-red-300 self-start">✕</button>
                  </div>
                ))}
                {(rows as EventRow[]).length === 0 && <div className="mono text-[11px] opacity-50">None</div>}
              </div>
            </div>
          ))}
          <div className="mt-5 border-t border-white/15 pt-4 space-y-2 mono text-[11px] text-[var(--ink)]">
            <div className="text-[10px] tracking-[0.2em] text-[var(--gold)]">+ ADD EVENT</div>
            <input className="field" placeholder="Event title *" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="field" type="date" value={ev.event_date} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} />
              <input className="field" placeholder="Type (Festival, AGM…)" value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })} />
            </div>
            <input className="field" placeholder="Details" value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} />
            <button onClick={addEvent} disabled={!!busy} className="w-full bg-[var(--gold)] text-black py-2 rounded-[2px] font-semibold tracking-[0.1em] disabled:opacity-60">{busy === "event" ? "SAVING…" : "ADD EVENT"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
