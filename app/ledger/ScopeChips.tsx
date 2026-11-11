"use client";
// Phones and tablets: the tower filter lives in the sidebar, which sits at the bottom of the page.
// This row repeats it at the top of the screens that use the filter (Flat Index, Reports, Directory).
import { filterName } from "@/lib/society";
import type { Ctx } from "./ctx";

export default function ScopeChips({ ctx, count }: { ctx: Ctx; count?: number }) {
  const { flats, categories, towerFilter, setTowerFilter, setSearch } = ctx;
  const towers = Array.from(new Set(flats.map((f) => f.tower).filter(Boolean))).sort() as string[];
  return (
    <div className="lg:hidden space-y-1.5" data-testid="scope-chips">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {["ALL", ...towers, "COMMITTEE"].map((t) => {
          const on = towerFilter === t;
          return (
            <button key={t} onClick={() => { setTowerFilter(t); setSearch(""); }}
              className={`shrink-0 mono text-[12px] font-bold px-4 py-2.5 rounded-[3px] border ${on ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--surface)] border-[var(--border)]"}`}>
              {t === "ALL" ? "ALL" : t === "COMMITTEE" ? "★ COMMITTEE" : `TOWER ${t}`}
            </button>
          );
        })}
      </div>
      {count !== undefined && (
        <div className="mono text-[11px] opacity-70 px-1">Showing: <b>{filterName(towerFilter, categories)}</b> • {count} flat{count === 1 ? "" : "s"}</div>
      )}
    </div>
  );
}
