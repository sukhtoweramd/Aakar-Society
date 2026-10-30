"use client";
import { SOCIETY, committeeRoster } from "@/lib/society";
import type { Ctx } from "./ctx";

export default function Sidebar({ ctx }: { ctx: Ctx }) {
  const { towerFilter, setTowerFilter, setSearch, go, flats } = ctx;
  const filter = (t: string) => { setTowerFilter(towerFilter === t ? "ALL" : t); setSearch(""); go("INDEX"); };
  const towers = Array.from(new Set(flats.map((f) => f.tower).filter(Boolean))).sort() as string[];
  const occupied = flats.filter((f) => f.owner_name).length;

  return (
    <aside className="order-2 lg:order-1 lg:sticky lg:top-[92px] space-y-4 min-w-0">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[6px] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="bg-[var(--navy)] text-[#fdfcf5] p-5">
          <div className="serif text-[24px] leading-none tracking-[0.02em] font-bold">{SOCIETY.building}</div>
          <div className="mono text-[12px] mt-3 opacity-80 leading-relaxed font-normal">
            REG NO {SOCIETY.reg}<br />DATE {SOCIETY.regDate}<br />
            {SOCIETY.addressLines.map((l) => <span key={l}>{l}<br /></span>)}
          </div>
          <div className="mt-4 inline-flex items-center gap-2 text-[11px] mono border border-white/20 px-2.5 py-1 rounded-[3px] bg-white/5">
            <span className="h-2 w-2 bg-[var(--gold)] rounded-full" /> EST 1994 • {flats.length} FLATS
          </div>
        </div>
        <div className="p-3 space-y-3">
          {towers.map((t) => {
            const inT = flats.filter((f) => f.tower === t);
            const floors = Math.max(0, ...inT.map((f) => f.floor ?? Math.floor((parseInt(f.id.replace(/\D/g, ""), 10) || 0) / 100)));
            const owners = inT.filter((f) => f.owner_name).length;
            const on = towerFilter === t;
            return (
              <button key={t} onClick={() => filter(t)}
                className={`w-full text-left border rounded-[6px] p-3.5 transition-all hover:shadow-sm hover:border-[var(--gold)] ${on ? "bg-amber-50 ring-1 ring-[var(--gold)] border-[var(--gold)]" : "bg-[var(--bg)] border-[var(--border)]"}`}>
                <div className="flex justify-between items-center">
                  <div className="serif text-[18px] font-bold">TOWER {t}</div>
                  <span className="mono text-[10px] opacity-60">{on ? "● SHOWING" : "↗ FILTER"}</span>
                </div>
                <div className="mono text-[11px] mt-1 opacity-70">{inT.length} flats • {floors} floors • {owners} owners recorded</div>
              </button>
            );
          })}
          {(() => {
            const people = committeeRoster(flats).filter((p) => p.name !== "Owner not recorded");
            const on = towerFilter === "COMMITTEE";
            return (
              <button onClick={() => filter("COMMITTEE")}
                className={`w-full text-left border rounded-[6px] p-3.5 transition-all hover:shadow-sm hover:border-[var(--gold)] ${on ? "bg-amber-50 ring-1 ring-[var(--gold)] border-[var(--gold)]" : "bg-[var(--bg)] border-[var(--border)]"}`}>
                <div className="flex justify-between items-center">
                  <div className="serif text-[18px] font-bold"><span className="text-[var(--gold)]">★</span> COMMITTEE</div>
                  <span className="mono text-[10px] opacity-60">{on ? "● SHOWING" : "↗ FILTER"}</span>
                </div>
                <div className="mono text-[11px] mt-1 opacity-70">{people.length ? `${people.length} member${people.length > 1 ? "s" : ""}: ${people.slice(0, 3).map((p) => `${p.name.split(/\s*[-–&,]\s*/)[0]} (${p.role})`).join(", ")}${people.length > 3 ? "…" : ""}` : "None marked yet"}</div>
              </button>
            );
          })()}
          {towerFilter !== "ALL" && (
            <button onClick={() => { setTowerFilter("ALL"); go("INDEX"); }} className="w-full mono text-[11px] border border-[var(--border)] bg-white px-3 py-2.5 rounded-[4px] hover:border-[var(--gold)] font-medium">
              CLEAR FILTER • SHOW ALL {flats.length} FLATS
            </button>
          )}
          <div className="border-t border-[var(--border)] pt-3 mono text-[11px] leading-relaxed opacity-70">
            <div className="flex justify-between"><span>Owners recorded</span><span>{occupied} / {flats.length}</span></div>
            <div className="flex justify-between"><span>Terrace Logic</span><span>Top floor = Owner</span></div>
            <div className="flex justify-between"><span>Document Vault</span><span>R2 • aakar-vault</span></div>
          </div>
        </div>
      </div>
      <div className="bg-[#fffbeb] border border-amber-200 rounded-[6px] p-4 mono text-[12px] leading-relaxed">
        <div className="font-bold tracking-[0.04em] text-[12px]">SOCIETY NOTICE</div>
        <div className="mt-1.5 opacity-80 leading-[1.6]">Terrace floors carry higher maintenance due to exclusive terrace ownership agreement. Refer VAULT doc marked IMPORTANT.</div>
      </div>
    </aside>
  );
}
