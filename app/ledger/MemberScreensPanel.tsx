"use client";
// ADMIN → MEMBER SCREENS: the committee (Secretary / Admin) ticks which tabs flat logins can open.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ALWAYS_TABS, cleanSetting, OPTIONAL_TABS } from "@/lib/memberTabs";

export default function MemberScreensPanel({ email }: { email: string }) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [ticks, setTicks] = useState<string[]>([]);
  const [needsSql, setNeedsSql] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const { data, error } = await supabase.from("app_settings").select("member_tabs").eq("id", 1).maybeSingle();
    if (error || !data) { setNeedsSql(true); return; }
    const list = (data as any).member_tabs as string[];
    setSaved(list); setTicks(list); setNeedsSql(false);
  }
  useEffect(() => { load(); }, []);

  const changed = saved !== null && cleanSetting(ticks).join() !== cleanSetting(saved).join();
  async function save() {
    setBusy(true); setMsg(null);
    const member_tabs = cleanSetting(ticks);
    const { data, error } = await supabase.from("app_settings").update({ member_tabs, updated_by: email, updated_at: new Date().toISOString() }).eq("id", 1).select("member_tabs");
    setBusy(false);
    if (error || !data?.length) { setMsg({ ok: false, text: error?.message || "Not saved: only committee logins can change this." }); return; }
    setSaved(member_tabs);
    setMsg({ ok: true, text: "Saved. Members see the new menu the next time they open the app." });
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 mono text-[11px]">
      <div className="font-bold tracking-[0.12em]">MEMBER SCREENS</div>
      <div className="opacity-70 mt-1">Which tabs flat logins can open. <b>MY FLAT</b> and <b>NOTICES</b> are always open, and login banners always show. Hiding a tab only changes the menu: what each login can read is still decided by the database rules.</div>
      {needsSql ? <div className="mt-3 text-amber-800">Run <b>MEMBER_SCREENS.sql</b> in Supabase first. Until then members see every member tab.</div> : (
        <>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {ALWAYS_TABS.map((t) => <label key={t} className="flex gap-2 items-start border border-[var(--border)] bg-[var(--bg)] p-2 opacity-70"><input type="checkbox" checked disabled /><span><b>{t === "DETAIL" ? "MY FLAT" : t}</b> — always open</span></label>)}
            {OPTIONAL_TABS.map((o) => (
              <label key={o.tab} className="flex gap-2 items-start border border-[var(--border)] bg-white p-2 cursor-pointer">
                <input type="checkbox" checked={ticks.includes(o.tab)} onChange={(e) => setTicks((x) => (e.target.checked ? [...x, o.tab] : x.filter((y) => y !== o.tab)))} />
                <span><b>{o.name}</b> — {o.what}</span>
              </label>))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={save} disabled={!changed || busy} className="btn-navy px-4 py-2 disabled:opacity-50">{busy ? "SAVING…" : "SAVE"}</button>
            {changed && <button onClick={() => setTicks(saved || [])} className="underline">Undo changes</button>}
            {msg && <span className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}
