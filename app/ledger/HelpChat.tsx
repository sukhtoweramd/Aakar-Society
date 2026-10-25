"use client";
// HELP: a floating button on every screen. Members ask how to use the app; answers come only from the help guide.
// When the guide has no answer, it shows the app coordinator (COMMITTEE → RESPONSIBILITIES, an area named "App…").
import { Fragment, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { personOf, type Area } from "@/lib/committee";
import type { Flat } from "@/lib/society";
import { waLink } from "@/lib/billing";
import { useContacts } from "./WhoToContact";

type Msg = { role: "user" | "assistant"; text: string; notFound?: boolean; error?: boolean };
const SUGGEST = ["How do I tell the committee I have paid?", "How do I register for an event?", "Where are my event passes?", "I forgot my password", "મારું બિલ ક્યાં જોવું?"];

/** **bold** → <b>, keeps line breaks. */
function Rich({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => (
    <Fragment key={i}>{i > 0 && <br />}{line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => /^\*\*[^*]+\*\*$/.test(part) ? <b key={j}>{part.slice(2, -2)}</b> : <Fragment key={j}>{part}</Fragment>)}</Fragment>
  ))}</>;
}

function Contacts({ flats, areas, question, isCommittee }: { flats: Flat[]; areas: Area[]; question: string; isCommittee: boolean }) {
  const app = areas.filter((a) => /\bapp\b|software|website|technical|\bit\b/i.test(`${a.name} ${a.description || ""}`));
  // No "App support" area yet: don't list unrelated areas (lift, water…); point to the committee instead.
  if (!app.length) return <div className="border border-[var(--border)] bg-white p-2.5 text-[13px]">Please contact a society committee member{isCommittee ? <div className="text-[11px] opacity-60 mt-1">Committee: add an area named “App support” with the coordinator's flat and mobile in COMMITTEE → RESPONSIBILITIES, and HELP will show that person here.</div> : "."}</div>;
  const list = app;
  return (
    <div className="space-y-2">
      <div className="mono text-[10px] tracking-[0.14em] font-bold">APP COORDINATOR</div>
      {list.slice(0, 4).map((a) => { const p = personOf(flats, a.holder_flat); return (
        <div key={a.id} className="border border-[var(--border)] bg-white p-2.5 text-[13px]">
          <b>{p?.name || a.name}</b>{p?.flat ? <span className="opacity-60"> • {p.flat}</span> : null}<div className="text-[11px] opacity-70">{a.name}</div>
          {a.contact_phone && <div className="flex flex-wrap gap-3 mt-1.5 text-[12px]">
            <a className="underline" href={waLink(a.contact_phone, `Aakar app help: ${question}`)} target="_blank" rel="noopener noreferrer">WhatsApp {a.contact_phone}</a>
            <a className="underline" href={`tel:${a.contact_phone.replace(/\s+/g, "")}`}>Call</a>
          </div>}
        </div>); })}
      <div className="text-[11px] opacity-60">If you see an error message, send them a screenshot of it.</div>
    </div>
  );
}

export default function HelpChat({ flats, isCommittee }: { flats: Flat[]; isCommittee: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const areas = useContacts();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);

  async function ask(text: string) {
    const question = text.trim(); if (!question || busy) return;
    const history = msgs.filter((m) => !m.error).slice(-4).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: question }]); setQ(""); setBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || "";
      const res = await fetch("/api/help", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ question, history }), signal: AbortSignal.timeout(35000) });
      const j = await res.json().catch(() => ({}));
      setMsgs((m) => [...m, res.ok ? { role: "assistant", text: j.answer, notFound: !!j.notFound } : { role: "assistant", text: j.error || "Help is not answering right now.", error: true, notFound: true }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Help is not answering right now. Please try again in a minute.", error: true, notFound: true }]);
    }
    setBusy(false);
  }
  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.text || "";

  return (
    <>
      {!open && <button onClick={() => setOpen(true)} aria-label="Help" className="fixed z-40 bg-[var(--navy)] text-white border-2 border-[var(--gold)] shadow-[0_6px_18px_rgba(0,0,0,.25)] rounded-full h-12 w-12 sm:h-14 sm:w-auto sm:px-5 flex items-center justify-center gap-2 font-bold tracking-[0.08em] text-[13px]"
        style={{ right: "calc(16px + env(safe-area-inset-right, 0px))", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
        <span className="h-6 w-6 rounded-full bg-[var(--gold)] text-[var(--navy)] grid place-items-center text-[15px]" aria-hidden="true">?</span><span className="hidden sm:inline">HELP</span>
      </button>}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/40 sm:bg-black/25 flex sm:justify-end" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Help">
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--bg)] w-full sm:w-[420px] h-full flex flex-col shadow-[0_0_40px_rgba(0,0,0,.3)]"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="bg-[var(--navy)] text-white px-4 py-3 flex items-center justify-between gap-2">
              <div><div className="font-bold tracking-[0.1em] text-[14px]">HELP</div><div className="text-[11px] opacity-75">Ask how to use the app • English, ગુજરાતી, हिंदी</div></div>
              <button onClick={() => setOpen(false)} aria-label="Close help" className="h-10 w-10 grid place-items-center text-[20px] hover:bg-white/10">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!msgs.length && <div className="space-y-3">
                <div className="text-[13px] opacity-80">Type your question, or tap one of these:</div>
                <div className="flex flex-col gap-2">{SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="text-left border border-[var(--border)] bg-white px-3 py-2.5 text-[13px] hover:border-[var(--gold)]">{s}</button>)}</div>
                <div className="text-[11px] opacity-60">Help explains how to use the app. It cannot see your bills or payments, and never asks for passwords or bank details.</div>
              </div>}
              {msgs.map((m, i) => m.role === "user"
                ? <div key={i} className="ml-auto max-w-[85%] bg-[var(--navy)] text-white px-3 py-2 text-[14px] w-fit">{m.text}</div>
                : <div key={i} className="max-w-[92%] space-y-2">
                    <div className={`border px-3 py-2.5 text-[14px] leading-relaxed ${m.error ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[var(--border)] bg-white"}`}><Rich text={m.text} /></div>
                    {m.notFound && i === msgs.length - 1 && <Contacts flats={flats} areas={areas} question={lastUser} isCommittee={isCommittee} />}
                  </div>)}
              {busy && <div className="text-[13px] opacity-60">Looking it up…</div>}
              <div ref={end} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="border-t border-[var(--border)] bg-[var(--surface)] p-3 flex gap-2">
              <label htmlFor="help-q" className="sr-only">Your question</label>
              <input id="help-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type your question…" maxLength={600} className="field flex-1 !text-[15px]" autoComplete="off" />
              <button disabled={busy || !q.trim()} className="btn-navy px-4 font-bold">ASK</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
