"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Notice } from "@/lib/society";
import { deleteFile, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";

export default function NoticesTab({ ctx }: { ctx: Ctx }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [n, setN] = useState({ title: "", content: "", tower: "Common", banner: false, until: "" });
  const [bannerReady, setBannerReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  async function load() {
    const a = await supabase.from("notices").select("*").order("created_at", { ascending: false });
    if (a.error) setError(a.error.message);
    setNotices((a.data as Notice[]) || []);
  }
  useEffect(() => {
    load();
    supabase.from("notices").select("is_banner").limit(1).then(({ error }) => setBannerReady(!error)); // BANNERS.sql run?
  }, []);
  async function setBanner(x: any, on: boolean) {
    let until: string | null = x.banner_until || null;
    if (on) {
      const v = prompt("Show as login banner until which date? (YYYY-MM-DD)\nLeave empty to keep it until you switch it off.", until || "");
      if (v === null) return;
      if (v.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) { setError("Date must look like 2026-10-31"); return; }
      until = v.trim() || null;
    }
    const { error } = await supabase.from("notices").update({ is_banner: on, banner_until: on ? until : null }).eq("id", x.id);
    if (error) setError(error.message); else load();
  }

  async function publish() {
    if (!n.title.trim()) { setError("Enter a notice title"); return; }
    setBusy("notice"); setError("");
    try {
      const url = file ? (await uploadFile(file, "notices")).url : null;
      const row: any = { title: n.title.trim(), content: n.content.trim() || null, tower: n.tower, file_url: url, created_by: ctx.email };
      if (bannerReady && n.banner) { row.is_banner = true; row.banner_until = n.until || null; }
      const { error } = await supabase.from("notices").insert([row]);
      if (error) throw error;
      setN({ title: "", content: "", tower: "Common", banner: false, until: "" }); setFile(null); setFileKey((k) => k + 1); load();
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


  return (
    <div className="space-y-4 fade-in">
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
      <div className="max-w-[900px]">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
          <div className="serif text-[22px] font-bold">Society Notices</div>
          <div className="mono text-[11px] opacity-60">{notices.length} notices • Common + tower-wise • Attachments stored in R2</div>
          {ctx.isCommittee && <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-4 space-y-2 mono text-[11px]">
            <div className="grid sm:grid-cols-[1fr_140px] gap-2">
              <input className="field" placeholder="Notice title *" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
              <select className="field" value={n.tower} onChange={(e) => setN({ ...n, tower: e.target.value })}>
                <option value="Common">All towers</option><option value="A">Tower A</option><option value="B">Tower B</option><option value="C">Tower C</option>
              </select>
            </div>
            <textarea className="field" rows={3} placeholder="Type notice…" value={n.content} onChange={(e) => setN({ ...n, content: e.target.value })} />
            {bannerReady && (
              <div className="flex flex-wrap items-center gap-3 border border-[var(--gold)] bg-[#fffdf5] p-2.5">
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={n.banner} onChange={(e) => setN({ ...n, banner: e.target.checked })} /> SHOW AS LOGIN BANNER</label>
                {n.banner && <label className="flex items-center gap-2">until <input type="date" className="field !w-auto !py-1" value={n.until} onChange={(e) => setN({ ...n, until: e.target.value })} /> <span className="opacity-60">(optional)</span></label>}
                <span className="opacity-60 text-[10px] w-full">Appears as a large banner right after members log in. Attach a photo (JPG/PNG) to show it on the banner.</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <input key={fileKey} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px]" />
              <button onClick={publish} disabled={!!busy} className="btn-navy px-5 py-2 tracking-[0.1em]">{busy === "notice" ? "PUBLISHING…" : "PUBLISH"}</button>
            </div>
          </div>}
          <div className="mt-4 space-y-2">
            {notices.map((x) => (
              <div key={x.id} className="border border-[var(--border)] bg-[var(--surface)] p-4 flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="serif text-[15px] font-bold">{x.title}</div>
                    {(x as any).is_banner && (!(x as any).banner_until || (x as any).banner_until >= new Date().toISOString().slice(0, 10)) && <span className="mono text-[9px] tracking-[0.12em] bg-[var(--gold)] text-black px-1.5 py-0.5 font-bold">★ LOGIN BANNER{(x as any).banner_until ? ` • UNTIL ${new Date((x as any).banner_until).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}</span>}
                    <span className="mono text-[9px] tracking-[0.12em] border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5">{!x.tower || /common|all/i.test(x.tower) ? "ALL TOWERS" : `TOWER ${x.tower.replace(/tower\s*/i, "")}`}</span>
                  </div>
                  {x.content && <div className="text-[13px] opacity-80 mt-1 whitespace-pre-wrap">{x.content}</div>}
                  <div className="mono text-[10px] opacity-50 mt-2">
                    {new Date(x.created_at).toLocaleString("en-IN")}{x.created_by ? ` • ${x.created_by}` : ""}
                    {x.file_url && <a href={x.file_url} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-[var(--navy)] opacity-100">📎 View file</a>}
                  </div>
                </div>
                {ctx.isCommittee && <div className="flex flex-col items-end gap-2 shrink-0 mono text-[10px]">
                  {bannerReady && ((x as any).is_banner
                    ? <button onClick={() => setBanner(x, false)} className="border border-[var(--gold)] bg-[#fffdf5] px-2 py-1 font-bold">BANNER: ON ✕</button>
                    : <button onClick={() => setBanner(x, true)} className="border border-[var(--border)] px-2 py-1">SHOW AS BANNER</button>)}
                  <button onClick={() => removeNotice(x)} className="text-red-600">DELETE</button>
                </div>}
              </div>
            ))}
            {notices.length === 0 && <div className="mono text-[11px] opacity-60">No notices yet.</div>}
          </div>
        </div>

      </div>
    </div>
  );
}
