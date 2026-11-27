"use client";
// ADMIN -> TERMS & PRIVACY: what members are shown (the notice and terms) and, for the society owner only, a short DPDP checklist.
import { societyTitle } from "@/lib/society";
import { OWNER_APP_GAPS, OWNER_APP_HELPS, OWNER_DUTIES, OWNER_TODO } from "@/lib/legalText";
import LegalView from "./LegalView";

const chip = (l: string) => (l === "CONFIRMED" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : l === "LIKELY" ? "bg-amber-50 text-amber-800 border-amber-300" : "bg-red-50 text-red-800 border-red-300");

export default function LegalPanel() {
  const box = "border border-[var(--border)] bg-[var(--surface)] p-4 min-w-0";
  return (
    <div className="space-y-6">
      <div className={box + " space-y-3"}>
        <div className="mono text-[10px] font-bold tracking-[0.14em]">FOR THE SOCIETY OWNER • DPDP ACT, 2023</div>
        <div className="space-y-2">
          {OWNER_DUTIES.map((d, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className={`mono text-[9px] font-bold border px-1.5 py-0.5 shrink-0 ${chip(d.label)}`}>{d.label}</span>
              <span className="mono text-[12px] opacity-85 min-w-0 break-words">{d.text}</span>
            </div>
          ))}
        </div>
        <div className="mono text-[11px] font-bold mt-2">WHAT THE SOCIETY SHOULD DO</div>
        <ul className="list-disc pl-5 space-y-1">{OWNER_TODO.map((t, i) => <li key={i} className="mono text-[12px] opacity-85 break-words">{t}</li>)}</ul>
        <div className="mono text-[11px] font-bold mt-2">WHAT THE APP ALREADY DOES</div>
        <ul className="list-disc pl-5 space-y-1">{OWNER_APP_HELPS.map((t, i) => <li key={i} className="mono text-[12px] opacity-85 break-words">{t}</li>)}</ul>
        <div className="mono text-[11px] font-bold mt-2">NOT YET IN THE APP</div>
        <ul className="list-disc pl-5 space-y-1">{OWNER_APP_GAPS.map((t, i) => <li key={i} className="mono text-[12px] opacity-85 break-words">{t}</li>)}</ul>
      </div>
      <div className="mono text-[11px] opacity-70">Members see the text below at <b>/legal</b> (linked from the login page). It uses your society's name from FLAT SETUP.</div>
      <LegalView society={societyTitle()} />
    </div>
  );
}
