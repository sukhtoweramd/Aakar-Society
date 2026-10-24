"use client";
// ADMIN → HELP GUIDE: the text the HELP assistant answers from. Committee edits it here; no code change needed.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/ledgerClient";

export default function HelpGuidePanel({ email }: { email: string }) {
  const [text, setText] = useState(""); const [saved, setSaved] = useState<{ by: string | null; at: string } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  async function load() {
    const { data, error } = await supabase.from("help_guide").select("*").eq("id", 1).maybeSingle();
    if (error) { setState(/help_guide|schema cache|does not exist/i.test(error.message) ? "missing" : "ready"); if (!/help_guide|schema cache|does not exist/i.test(error.message)) setErr(error.message); return; }
    if (data) { setText(data.content); setSaved({ by: data.updated_by, at: data.updated_at }); }
    else { try { setText((await api("/api/help")).content || ""); } catch (e: any) { setErr(e.message); } setSaved(null); }
    setState("ready");
  }
  useEffect(() => { if (open && state === "loading") load(); }, [open]);
  async function save() {
    setErr(""); setMsg("");
    if (text.trim().length < 50) { setErr("The guide is too short."); return; }
    setBusy(true);
    const { error } = await supabase.from("help_guide").upsert({ id: 1, content: text.trim(), updated_by: email, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg("Saved. HELP uses this guide from now on."); load();
  }
  async function reset() {
    try { const d = await api("/api/help"); setText(d.content || ""); setMsg("Built-in guide loaded into the editor. Press SAVE GUIDE to use it."); } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-bold tracking-[0.12em]">HELP GUIDE</div>
          <div className="opacity-60 mt-1">What the HELP button answers from. Edit it when a rule or screen changes, or when HELP could not answer a common question.</div></div>
        <button onClick={() => setOpen(!open)} className="btn-line px-4 py-2">{open ? "CLOSE" : "EDIT HELP GUIDE"}</button>
      </div>
      {open && <div className="mt-4 space-y-3">
        {state === "loading" && <div className="opacity-60">Loading…</div>}
        {state === "missing" && <div className="border border-amber-200 bg-amber-50 text-amber-800 p-3">Run <b>HELP_GUIDE.sql</b> once in Supabase to edit the guide here. Until then HELP uses the built-in guide.</div>}
        {state === "ready" && <>
          <div className={saved ? "text-emerald-700" : "text-amber-800"}>{saved ? `Saved by ${saved.by || "—"} on ${new Date(saved.at).toLocaleString("en-IN")}` : "Not saved yet: HELP is using the built-in guide shown below."}</div>
          <ul className="list-disc pl-5 opacity-70 space-y-0.5">
            <li>Write plain steps, using the button and tab names as they appear in the app.</li>
            <li>Lines starting with ## are section headings; - starts a point.</li>
            <li>No passwords, bank or card numbers. Contact details come from COMMITTEE → RESPONSIBILITIES (area "App support").</li>
          </ul>
          <label htmlFor="help-guide-text" className="sr-only">Help guide text</label>
          <textarea id="help-guide-text" value={text} onChange={(e) => setText(e.target.value)} className="field w-full h-[60vh] !font-mono !text-[12px] leading-relaxed" spellCheck />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy} className="btn-navy px-5 py-2.5 tracking-[0.1em]">{busy ? "SAVING…" : "SAVE GUIDE"}</button>
            <button onClick={reset} className="btn-line px-4 py-2.5">LOAD BUILT-IN GUIDE</button>
            <span className="opacity-60 ml-auto">{text.length.toLocaleString("en-IN")} / 60,000 characters</span>
          </div>
          {err && <div className="text-red-700">{err}</div>}{msg && <div className="text-emerald-700">✓ {msg}</div>}
        </>}
      </div>}
    </div>
  );
}
