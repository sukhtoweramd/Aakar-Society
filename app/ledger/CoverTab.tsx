"use client";
import { useEffect, useState } from "react";
import { SOCIETY, label, ownerText, committeeRoster, isCoopted } from "@/lib/society";
import { amcAlerts, loadAmc, loadAreas, type Area } from "@/lib/committee";
import WhoToContact from "./WhoToContact";
import { RESIDENT_TABS, type Ctx, type Tab } from "./ctx";

const TILES: { id: Tab; title: string; desc: string }[] = [
  { id: "INDEX", title: "ALL FLATS", desc: "Grid of all flats A/B/C" },
  { id: "FLOOR", title: "FLOOR PLANS", desc: "Tower-wise plans in R2" },
  { id: "DETAIL", title: "MEMBER DETAIL", desc: "Owner, charges, documents" },
  { id: "DIRECTORY", title: "MEMBER DIRECTORY", desc: "Families & mobiles (with consent)" },
  { id: "BUSINESS", title: "BUSINESS DIR", desc: "Members' professions" },
  { id: "VAULT", title: "VAULT 🔒", desc: "Society legal documents" },
  { id: "CONTACTS", title: "IMPORTANT CONTACTS", desc: "Lift, fire, security, plumber …" },
  { id: "NOTICES", title: "NOTICES", desc: "Society notices" },
  { id: "EVENTS", title: "EVENTS", desc: "Events & photo gallery" },
  { id: "COMMITTEE", title: "COMMITTEE", desc: "Responsibilities & AMC" },
  { id: "ADMIN", title: "ADMIN", desc: "Charges control panel" },
  { id: "REPORTS", title: "REPORTS", desc: "CSV / PDF directory" },
];

export default function CoverTab({ ctx }: { ctx: Ctx }) {
  const { flats, go, selectFlat } = ctx;
  const towers = Array.from(new Set(flats.map((f) => f.tower).filter(Boolean))).sort() as string[];
  const committee = committeeRoster(flats); // Chairman, Secretary, Treasurer, then flat order
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [amcDue, setAmcDue] = useState(0);
  useEffect(() => { loadAreas().then(setAreas); if (ctx.isCommittee) loadAmc().then((d) => setAmcDue(d ? amcAlerts(d.amc).length : 0)); }, [ctx.isCommittee]);
  const contacts = (areas || []).filter((a) => a.holder_flat);

  return (
    <div className="space-y-6 fade-in">
      {ctx.isCommittee && amcDue > 0 && (
        <button onClick={() => go("COMMITTEE")} className="w-full text-left border-2 border-red-300 bg-red-50 p-3 mono text-[11px] text-red-800">
          <b>{amcDue} AMC contract{amcDue > 1 ? "s" : ""}</b> ending within 30 days or already ended. Open COMMITTEE → AMC CONTRACTS to renew →</button>
      )}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] overflow-hidden">
        <div className="p-6 md:p-12">
          {contacts.length > 0 && <button onClick={() => document.getElementById("who-to-contact")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="btn-line mono text-[11px] font-bold px-3 py-2 mb-5">WHO TO CONTACT ↓</button>}
          <div className="flex flex-wrap gap-6 items-start justify-between">
            <div>
              <div className="h-16 w-16 rounded-full border border-[var(--gold)] grid place-items-center text-[36px] serif bg-[var(--bg)]">ॐ</div>
              <h1 className="serif text-[40px] md:text-[64px] leading-[0.9] mt-6 tracking-[0.02em] font-[800] break-words">AAKAR<br />CO-OP</h1>
              <div className="mono text-[12px] tracking-[0.3em] mt-3">HOUSING SOCIETY LTD.</div>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 mono text-[11px] max-w-[420px]">
                <div className="border border-[var(--border)] p-3 bg-[var(--bg)]">
                  <div className="opacity-60">REGISTRATION</div>
                  <div className="serif text-[16px] font-bold mt-1">{SOCIETY.reg}</div>
                  <div>{SOCIETY.regDate}</div>
                </div>
                <div className="border border-[var(--border)] p-3 bg-[var(--bg)]">
                  <div className="opacity-60">ADDRESS</div>
                  <div className="serif text-[13px] font-bold mt-1 leading-tight">{SOCIETY.address}</div>
                </div>
              </div>
            </div>
            <div className="w-full md:w-[340px] space-y-3 min-w-0">
              <div className="border border-[var(--navy)] p-4 bg-[var(--navy)] text-[#fdfcf5]">
                <div className="mono text-[10px] tracking-[0.2em]">SOCIETY SEAL</div>
                <div className="serif text-[18px] mt-2 leading-tight">{flats.length} Flats across<br />Tower {towers.join(" • ")}</div>
                <div className="mt-4 grid grid-cols-3 gap-2 mono text-[10px] text-center">
                  {towers.map((t) => (
                    <div key={t} className="border border-white/20 p-2"><div className="text-[18px] serif">{flats.filter((f) => f.tower === t).length}</div>TOWER {t}</div>
                  ))}
                </div>
              </div>
              <div className="border border-[var(--border)] bg-[var(--bg)] p-3 mono text-[10px]">
                <div className="flex justify-between"><span>Ledger Status</span><span className="text-emerald-600">● LIVE</span></div>
                <div className="flex justify-between mt-1"><span>Owners recorded</span><span>{flats.filter((f) => f.owner_name).length} / {flats.length}</span></div>
                <div className="mt-2 pt-2 border-t border-dashed border-[var(--border)]">
                  <div className="opacity-60 mb-1">COMMITTEE</div>
                  {committee.length === 0 && <div className="opacity-60">Not recorded yet • mark in DETAIL</div>}
                  {committee.map((p, i) => (
                    <button key={`${p.flat.id}:${i}`} onClick={() => { if (ctx.isCommittee) { selectFlat(p.flat.id); go("DETAIL"); } }} className="w-full flex justify-between gap-2 hover:underline text-left py-0.5">
                      <span className="min-w-0 truncate">{p.name} <span className="opacity-70">({p.role})</span>{isCoopted(p.role) && <span className="ml-1 px-1 border border-[var(--gold)] text-[9px] align-middle">CO-OPTED</span>}</span><span className="shrink-0">{label(p.flat)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-dashed border-[var(--border)] pt-6 grid grid-cols-1 md:grid-cols-3 gap-6 mono text-[11px]">
            <div><div className="font-bold tracking-[0.16em]">01 • TERRACE LOGIC</div><div className="opacity-70 mt-1">Top floor flats own the terrace as per registered agreement. Higher sqft and maintenance.</div></div>
            <div><div className="font-bold tracking-[0.16em]">02 • VAULT</div><div className="opacity-70 mt-1">Legal documents stored in the Society Document Vault on Cloudflare R2.</div></div>
            <div><div className="font-bold tracking-[0.16em]">03 • CHARGES</div><div className="opacity-70 mt-1">Control panel for maintenance per category. Yellow = terrace ownership.</div></div>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {TILES.filter((m) => ctx.isCommittee || RESIDENT_TABS.includes(m.id)).map((m) => (
              <button key={m.id} onClick={() => go(m.id)} className="text-left border border-[var(--border)] bg-[var(--bg)] p-3 hover:border-[var(--gold)] mono">
                <div className="text-[11px] font-bold tracking-[0.12em]">{m.id}</div>
                <div className="serif text-[13px] font-bold mt-1">{m.title}</div>
                <div className="text-[10px] opacity-60 mt-1">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
        {contacts.length > 0 && <WhoToContact id="who-to-contact" flats={flats} isCommittee={ctx.isCommittee} areas={contacts} className="border-t border-[var(--border)] px-6 md:px-12 py-6" />}
        <div className="bg-[var(--bg-soft)] border-t border-[var(--border)] mono text-[10px] px-4 md:px-8 py-3 flex flex-wrap gap-4">
          <span>COVER PAGE • AAKAR CO-OP SOCIETY RECORD</span>
          <span className="opacity-50">•</span>
          <span className="opacity-70">Use top nav to browse INDEX, FLOOR, DETAIL, BUSINESS, VAULT, NOTICES, EVENTS, ADMIN, REPORTS</span>
        </div>
      </div>
    </div>
  );
}
