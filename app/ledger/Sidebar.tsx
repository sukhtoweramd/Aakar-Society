"use client";
import { SOCIETY, rupees } from "@/lib/society";
import type { Ctx } from "./ctx";

export default function Sidebar({ ctx }: { ctx: Ctx }) {
  const { categories: allCats, towerFilter, setTowerFilter, setSearch, go, flats, isCommittee } = ctx;
  const categories = isCommittee ? allCats : []; // residents don't see other flats' charges
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
          {categories.filter((c) => !c.terrace).map((c) => (
            <button key={c.key} onClick={() => filter(c.tower)}
              className={`w-full text-left border rounded-[6px] p-3.5 transition-all hover:shadow-sm hover:border-[var(--gold)] bg-[var(--bg)] border-[var(--border)] ${towerFilter === c.tower ? "ring-1 ring-[var(--gold)] border-[var(--gold)]" : ""}`}>
              <div className="mono text-[11px] tracking-[0.06em] font-semibold">{c.label}</div>
              <div className="serif text-[14px] mt-2 font-semibold">{c.range} • {c.ids.length} FLATS</div>
              <div className="mt-3 grid grid-cols-2 gap-2 mono text-[11px]">
                <div className="border border-[var(--border)] bg-white/80 p-2.5 rounded-[4px]">MAINT<br /><span className="text-[15px] serif font-bold">{rupees(c.maint)}</span></div>
                <div className="border border-[var(--border)] bg-white/80 p-2.5 rounded-[4px]">SQFT<br /><span className="text-[15px] serif font-bold">{c.sqft ?? "—"}</span></div>
              </div>
              <div className="mono text-[11px] mt-2.5 opacity-60 flex justify-between">
                <span>{c.bhk || "—"} • Standard</span><span className="opacity-50">↗ FILTER</span>
              </div>
            </button>
          ))}
          <div className="grid grid-cols-1 gap-2">
            {categories.filter((c) => c.terrace).map((c) => (
              <button key={c.key} onClick={() => filter(c.tower)}
                className={`w-full text-left border rounded-[6px] p-3 bg-[#fff8d6] border-amber-300 hover:border-amber-500 transition-colors ${towerFilter === c.tower ? "ring-1 ring-amber-500" : ""}`}>
                <div className="flex justify-between items-center gap-2">
                  <div className="mono text-[11px] tracking-[0.04em] font-bold">{c.label}</div>
                  <span className="mono text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded-[2px] font-bold shrink-0">TERRACE • OWNER</span>
                </div>
                <div className="mono text-[11px] mt-1.5 opacity-70">{c.range} • {rupees(c.maint)} • {c.sqft ?? "—"} sqft • Click to filter {c.tower}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {towers.map((t) => (
              <button key={t} onClick={() => filter(t)}
                className={`text-left border border-dashed p-2.5 mono text-[11px] transition-colors hover:border-[var(--gold)] rounded-[4px] ${towerFilter === t ? "bg-amber-50 border-[var(--gold)]" : "border-[var(--border)]"}`}>
                TOWER {t}<br />{flats.filter((f) => f.tower === t).length} FLATS
              </button>
            ))}
          </div>
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
