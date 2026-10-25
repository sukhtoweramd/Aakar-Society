"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Notice } from "@/lib/society";
import { deleteFile, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";
import MeetingMinutesList from "./MeetingMinutesList";
import { loadSettings, loadSignatories, noticeHtml, openPrint, preparingWindow, type NoticeSigner, type Signatory } from "@/lib/billing";
import { byCommitteeRole } from "@/lib/society";
import { FileLink, SecureImg } from "./SecureFile";
import { fileLink } from "@/lib/fileLinks";

type N = Notice & { is_banner?: boolean; banner_until?: string | null };
type Form = { title: string; content: string; tower: string; banner: boolean; until: string };
const BLANK: Form = { title: "", content: "", tower: "Common", banner: false, until: "" };
const isImage = (url?: string | null) => !!url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
const today = () => new Date().toISOString().slice(0, 10);
const towerText = (t?: string | null) => (!t || /common|all/i.test(t) ? "ALL TOWERS" : `TOWER ${t.replace(/tower\s*/i, "")}`);

/** Print / save as PDF on the society letterhead, signed by the chosen committee member ("" = no signature). */
async function printNotice(x: N, signer: NoticeSigner | null) {
  const w = preparingWindow("Preparing the notice…");
  const settings = await loadSettings();
  // the picture prints through a short-lived signed link (the stored link is not opened directly)
  const file_url = x.file_url ? await fileLink(x.file_url).catch(() => null) : null;
  openPrint(`Notice – ${x.title || ""}`, [noticeHtml({ ...x, file_url }, { settings, signatories: [], flats: [] }, signer)], w);
}
/** Who can sign a printed notice: the committee members (from the flats list) plus anyone set up under
 *  BILLING → SETTINGS → signatories. A matching signatory (same name) adds the signature image;
 *  without one the name and designation print with an empty space for a hand signature. */
function signerOptions(flats: Ctx["flats"], sigs: Signatory[]): (NoticeSigner & { key: string })[] {
  const out: (NoticeSigner & { key: string })[] = [];
  const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const f of flats.filter((f) => f.is_committee && f.owner_name?.trim()).sort(byCommitteeRole)) {
    const g = sigs.find((g) => same(g.name, f.owner_name));
    out.push({ key: `flat:${f.id}`, name: f.owner_name!.trim(), designation: g?.designation || f.committee_role?.trim() || "Committee Member", signature_image: g?.signature_image || null });
  }
  for (const g of sigs) if (!out.some((o) => same(o.name, g.name))) out.push({ key: `sig:${g.id}`, name: g.name, designation: g.designation, signature_image: g.signature_image });
  return out;
}

export default function NoticesTab({ ctx }: { ctx: Ctx }) {
  const [notices, setNotices] = useState<N[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [n, setN] = useState<Form>(BLANK);
  const [bannerReady, setBannerReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  // editing an existing notice
  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState<Form>(BLANK);
  const [eFile, setEFile] = useState<File | null>(null);
  const [eRemoveFile, setERemoveFile] = useState(false);
  const [signers, setSigners] = useState<(NoticeSigner & { key: string })[]>([]);
  const [signer, setSigner] = useState("");
  useEffect(() => {
    if (!ctx.isCommittee) return;
    loadSignatories().then((sg) => {
      const a = signerOptions(ctx.flats, sg.filter((g) => g.active)); setSigners(a);
      setSigner((a.find((g) => /secretary/i.test(g.designation)) || a[0])?.key || "");
    }).catch(() => {});
  }, [ctx.isCommittee, ctx.flats]);

  async function load() {
    const a = await supabase.from("notices").select("*").order("created_at", { ascending: false });
    if (a.error) setError(a.error.message);
    setNotices((a.data as N[]) || []);
  }
  useEffect(() => {
    load();
    supabase.from("notices").select("is_banner").limit(1).then(({ error }) => setBannerReady(!error)); // BANNERS.sql run?
  }, []);

  async function setBanner(x: N, on: boolean) {
    const upd: any = { is_banner: on };
    if (on && x.banner_until && x.banner_until < today()) upd.banner_until = null; // old end date has passed
    const { error } = await supabase.from("notices").update(upd).eq("id", x.id);
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
      setN(BLANK); setFile(null); setFileKey((k) => k + 1); load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }

  function startEdit(x: N) {
    setEditId(x.id); setEFile(null); setERemoveFile(false); setError("");
    setEf({ title: x.title || "", content: x.content || "", tower: !x.tower || /common|all/i.test(x.tower) ? "Common" : x.tower.replace(/tower\s*/i, ""), banner: !!x.is_banner, until: x.banner_until || "" });
  }
  async function saveEdit(x: N) {
    if (!ef.title.trim()) { setError("Enter a notice title"); return; }
    setBusy("edit"); setError("");
    try {
      let file_url = x.file_url || null;
      if (eFile) file_url = (await uploadFile(eFile, "notices")).url;
      else if (eRemoveFile) file_url = null;
      const upd: any = { title: ef.title.trim(), content: ef.content.trim() || null, tower: ef.tower, file_url };
      if (bannerReady) { upd.is_banner = ef.banner; upd.banner_until = ef.banner ? ef.until || null : null; }
      const { error } = await supabase.from("notices").update(upd).eq("id", x.id);
      if (error) throw error;
      // the old picture/file is no longer used
      if (x.file_url && x.file_url !== file_url) deleteFile({ url: x.file_url }).catch(() => {});
      setEditId(null); load();
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function removeNotice(x: N) {
    if (!confirm(`Delete notice "${x.title}"?`)) return;
    const { error } = await supabase.from("notices").delete().eq("id", x.id);
    if (error) { setError(error.message); return; }
    if (x.file_url) deleteFile({ url: x.file_url }).catch(() => {});
    load();
  }

  const bannerFields = (f: Form, set: (f: Form) => void) => bannerReady && (
    <div className="flex flex-wrap items-center gap-3 border border-[var(--gold)] bg-[#fffdf5] p-2.5">
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={f.banner} onChange={(e) => set({ ...f, banner: e.target.checked })} /> SHOW AS LOGIN BANNER</label>
      {f.banner && <label className="flex items-center gap-2">until <input type="date" className="field !w-auto !py-1" value={f.until} onChange={(e) => set({ ...f, until: e.target.value })} /> <span className="opacity-60">(optional)</span>
        {f.until && <button type="button" onClick={() => set({ ...f, until: "" })} className="underline">clear</button>}</label>}
      <span className="opacity-60 text-[10px] w-full">Appears as a large banner right after members log in. Attach a photo or poster (JPG/PNG) to show it on the banner.</span>
    </div>
  );

  return (
    <div className="space-y-4 fade-in">
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
      <div className="max-w-[900px]">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
          <div className="serif text-[22px] font-bold">Society Notices</div>
          <div className="mono text-[11px] opacity-60">{notices.length} notices • Common + tower-wise • Attachments stored in R2</div>
          {(() => { const live = notices.filter((x) => x.is_banner && (!x.banner_until || x.banner_until >= today())).length; return live > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 mono text-[11px]">
              <span><b>{live}</b> notice{live === 1 ? " is" : "s are"} shown as a login banner{ctx.isCommittee ? "" : " for some towers"}.</span>
              <button onClick={() => { try { Object.keys(sessionStorage).filter((k) => k.startsWith("aakar_banner_closed_")).forEach((k) => sessionStorage.removeItem(k)); } catch {} location.reload(); }}
                className="btn-line px-3 py-1.5 font-bold">SEE LOGIN BANNERS NOW</button>
            </div>); })()}
          {ctx.isCommittee && <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-4 space-y-2 mono text-[11px]">
            <div className="text-[10px] tracking-[0.14em] font-bold opacity-70">NEW NOTICE</div>
            <div className="grid sm:grid-cols-[1fr_140px] gap-2">
              <input className="field" placeholder="Notice title *" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
              <select className="field" value={n.tower} onChange={(e) => setN({ ...n, tower: e.target.value })}>
                <option value="Common">All towers</option><option value="A">Tower A</option><option value="B">Tower B</option><option value="C">Tower C</option>
              </select>
            </div>
            <textarea className="field" rows={3} placeholder="Type notice…" value={n.content} onChange={(e) => setN({ ...n, content: e.target.value })} />
            {bannerFields(n, setN)}
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <input key={fileKey} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px]" />
              <button onClick={publish} disabled={!!busy} className="btn-navy px-5 py-2 tracking-[0.1em]">{busy === "notice" ? "PUBLISHING…" : "PUBLISH"}</button>
            </div>
          </div>}
          {ctx.isCommittee && notices.length > 0 && <label className="mt-4 flex flex-wrap items-center justify-end gap-2 mono text-[10px] tracking-[0.1em]">PRINTED NOTICES SIGNED BY
            <select className="field !w-[260px]" value={signer} onChange={(e) => setSigner(e.target.value)}>
              <option value="">— no signature (Managing Committee) —</option>{signers.map((g) => <option key={g.key} value={g.key}>{g.designation} – {g.name}{g.signature_image ? "" : " (sign by hand)"}</option>)}</select></label>}
          <div className="mt-4 space-y-2">
            {notices.map((x) => editId === x.id ? (
              <div key={x.id} className="border-2 border-[var(--gold)] bg-[#fffdf5] p-4 space-y-2 mono text-[11px]">
                <div className="text-[10px] tracking-[0.14em] font-bold opacity-70">EDIT NOTICE</div>
                <div className="grid sm:grid-cols-[1fr_140px] gap-2">
                  <input className="field" placeholder="Notice title *" value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} />
                  <select className="field" value={ef.tower} onChange={(e) => setEf({ ...ef, tower: e.target.value })}>
                    <option value="Common">All towers</option><option value="A">Tower A</option><option value="B">Tower B</option><option value="C">Tower C</option>
                  </select>
                </div>
                <textarea className="field" rows={4} placeholder="Type notice…" value={ef.content} onChange={(e) => setEf({ ...ef, content: e.target.value })} />
                {bannerFields(ef, setEf)}
                <div className="border border-[var(--border)] bg-white p-2.5 flex flex-wrap items-center gap-3">
                  <span className="font-bold">PICTURE / FILE</span>
                  {x.file_url && !eRemoveFile && !eFile && (isImage(x.file_url)
                    ? <SecureImg src={x.file_url} alt="" className="h-14 w-14 object-cover border border-[var(--border)]" />
                    : <FileLink file={x.file_url} className="underline">📎 current file</FileLink>)}
                  {x.file_url && eRemoveFile && <span className="text-red-700">will be removed</span>}
                  {!x.file_url && !eFile && <span className="opacity-60">none</span>}
                  <label className="btn-line px-3 py-1.5 cursor-pointer">{x.file_url ? "REPLACE" : "ADD"}
                    <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => { setEFile(e.target.files?.[0] || null); setERemoveFile(false); }} />
                  </label>
                  {eFile && <span className="text-[var(--navy)] font-bold">New: {eFile.name}</span>}
                  {x.file_url && !eRemoveFile && <button type="button" onClick={() => { setERemoveFile(true); setEFile(null); }} className="text-red-600 underline">Remove</button>}
                  {eRemoveFile && <button type="button" onClick={() => setERemoveFile(false)} className="underline">Undo</button>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(x)} disabled={!!busy} className="btn-navy px-5 py-2 tracking-[0.1em]">{busy === "edit" ? "SAVING…" : "SAVE CHANGES"}</button>
                  <button onClick={() => setEditId(null)} className="btn-line px-4 py-2">CANCEL</button>
                </div>
              </div>
            ) : (
              <div key={x.id} className="border border-[var(--border)] bg-[var(--surface)] p-4 flex justify-between gap-3">
                <div className="min-w-0 flex gap-3">
                  {isImage(x.file_url) && <FileLink file={x.file_url} className="shrink-0"><SecureImg src={x.file_url} alt="" className="h-20 w-20 object-cover border border-[var(--border)]" /></FileLink>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="serif text-[15px] font-bold">{x.title}</div>
                      {x.is_banner && (!x.banner_until || x.banner_until >= today()) && <span className="mono text-[9px] tracking-[0.12em] bg-[var(--gold)] text-black px-1.5 py-0.5 font-bold">★ LOGIN BANNER{x.banner_until ? ` • UNTIL ${new Date(x.banner_until).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}</span>}
                      {x.is_banner && x.banner_until && x.banner_until < today() && ctx.isCommittee && <span className="mono text-[9px] tracking-[0.12em] border border-[var(--border)] px-1.5 py-0.5 opacity-60">BANNER ENDED</span>}
                      <span className="mono text-[9px] tracking-[0.12em] border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5">{towerText(x.tower)}</span>
                    </div>
                    {x.content && <div className="text-[13px] opacity-80 mt-1 whitespace-pre-wrap">{x.content}</div>}
                    <div className="mono text-[10px] opacity-50 mt-2">
                      {new Date(x.created_at).toLocaleString("en-IN")}{x.created_by ? ` • ${x.created_by}` : ""}
                      {x.file_url && <FileLink file={x.file_url} className="ml-2 underline text-[var(--navy)] opacity-100">📎 View file</FileLink>}
                    </div>
                  </div>
                </div>
                {ctx.isCommittee && <div className="flex flex-col items-end gap-2 shrink-0 mono text-[10px]">
                  <button onClick={() => startEdit(x)} className="btn-navy px-3 py-1">EDIT</button>
                  <button onClick={() => printNotice(x, signers.find((g) => g.key === signer) || null)} className="border border-[var(--navy)] px-2 py-1 font-bold">PRINT / PDF</button>
                  {bannerReady && (x.is_banner
                    ? <button onClick={() => setBanner(x, false)} title="Shown as a banner after login. Tap to stop." className="border border-[var(--gold)] bg-[var(--gold)] text-black px-2 py-1 font-bold">★ BANNER ON • TURN OFF</button>
                    : <button onClick={() => setBanner(x, true)} title="Not a banner now. Tap to show it after login." className="border border-dashed border-[var(--border)] px-2 py-1 opacity-80">BANNER OFF • TURN ON</button>)}
                  <button onClick={() => removeNotice(x)} className="text-red-600">DELETE</button>
                </div>}
              </div>
            ))}
            {notices.length === 0 && <div className="mono text-[11px] opacity-60">No notices yet.</div>}
          </div>
        </div>
      </div>
      <div className="max-w-[900px]"><MeetingMinutesList flats={ctx.flats} /></div>
    </div>
  );
}
