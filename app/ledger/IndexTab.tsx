"use client";
import { filterName, inFilter, floorOf, isOccupied, label, ownerText, rupees, statusText, committeeBadge } from "@/lib/society";
import type { Ctx } from "./ctx";

export default function IndexTab({ ctx }: { ctx: Ctx }) {
  const { flats, categories, towerFilter, setTowerFilter, search, setSearch, selectedId, selectFlat, go, isCommittee, myFlat } = ctx;
  const q = search.trim().toLowerCase();
  const list = flats.filter((f) =>
    inFilter(f, towerFilter, categories) &&
    (!q || label(f).toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || (f.owner_name || "").toLowerCase().includes(q) || (f.tenant_name || "").toLowerCase().includes(q)));
  const terraceIds = new Set(categories.filter((c) => c.terrace).flatMap((c) => c.ids));

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="serif text-[20px] font-bold">Flat Index</div>
          <div className="mono text-[11px] opacity-60 mt-1">
            {flats.length} flats {isCommittee ? "ledger • Click any flat card to view full DETAIL" : "directory • Click your own flat to open MY FLAT"} • Filter {towerFilter === "ALL" ? "OFF" : `ON: ${filterName(towerFilter, categories)}`}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search A-101, owner…"
            className="mono text-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 w-[180px] sm:w-[220px] rounded-[2px] outline-none focus:border-[var(--gold)]" />
          <div className="mono text-[10px] border border-[var(--border)] px-2 py-2 bg-[var(--bg)]">{list.length} results</div>
          {towerFilter !== "ALL" && <button onClick={() => setTowerFilter("ALL")} className="mono text-[10px] bg-[var(--navy)] text-white px-2 py-2">CLEAR FILTER ✕</button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mono text-[10px] opacity-70 px-1">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Occupied / filled</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-3 bg-[#fff8d6] border border-amber-300" />Terrace owner</span>
        <span className="inline-flex items-center gap-1.5"><span className="text-[var(--gold)]">★</span>Committee</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {list.map((f) => {
          const terrace = terraceIds.has(f.id);
          return (
            <button key={f.id} onClick={() => { if (isCommittee) { selectFlat(f.id); go("DETAIL"); } else if (f.id === myFlat) go("DETAIL"); }}
              className={`text-left border rounded-[3px] p-3 transition-all hover:shadow-sm group ${terrace ? "bg-[#fff8d6] border-amber-300 hover:border-amber-500" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--gold)]"} ${selectedId === f.id ? "ring-1 ring-[var(--gold)]" : ""}`}>
              <div className="flex justify-between items-start">
                <div className="mono text-[11px] font-bold tracking-[0.08em]">{label(f)}{f.is_committee && <span className="text-[var(--gold)] ml-1" title={committeeBadge(f)}>★</span>}</div>
                <span title={statusText(f)} className={`h-2 w-2 rounded-full ${isOccupied(f) ? "bg-emerald-500" : "bg-amber-400"}`} />
              </div>
              <div className={`serif text-[12px] mt-1 leading-tight truncate ${f.owner_name ? "" : "opacity-40"}`}>{f.owner_name ? ownerText(f) : "—"}</div>
              {f.is_committee && <div className="mono text-[9px] mt-1 text-[var(--gold)] font-bold truncate">{committeeBadge(f)}</div>}
              {f.occupancy === "tenant" && <div className="mono text-[9px] mt-1 truncate"><span className="bg-[var(--navy)] text-white px-1 mr-1">ON RENT</span>{f.tenant_name || ""}</div>}
              <div className="mono text-[9px] mt-2 opacity-60">{f.bhk ? `${f.bhk} • ` : ""}{f.tower} • F{floorOf(f)}</div>
              {isCommittee && <div className="mono text-[9px] mt-1 flex justify-between"><span>{rupees(f.maintenance)}</span><span>{f.sqft ? `${f.sqft} sqft` : ""}</span></div>}
              {(isCommittee || f.id === myFlat) && <div className="mono text-[8px] mt-2 opacity-0 group-hover:opacity-60 transition-opacity">{f.id === myFlat ? "MY FLAT ↗" : "CLICK → DETAIL ↗"}</div>}
            </button>
          );
        })}
      </div>
      {list.length === 0 && (
        <div className="border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center mono text-[12px] opacity-60">
          No flats found for {filterName(towerFilter, categories)} + search &quot;{search}&quot; • <button onClick={() => { setSearch(""); setTowerFilter("ALL"); }} className="underline">Clear</button>
        </div>
      )}
    </div>
  );
}
