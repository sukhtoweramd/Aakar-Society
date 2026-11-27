"use client";
// ADMIN → FLAT SETUP (19 Nov 2026): how this society is set up, read from the society profile, the towers and the flats.
// Shows structure only (tower, floor, flat number, rates), never owners. This file never writes: the society details and the
// towers are edited in SetupEditors.tsx (main admin only, decided by the database); floors, flats and rates are view only here.
import { useMemo, useState } from "react";
import { rupees } from "@/lib/society";
import { followsPattern, numberingExceptions, towerViews } from "@/lib/setupView";
import type { Ctx } from "./ctx";
import { SocietyDetails, TowerEditor } from "./SetupEditors";
import FlatGenerator from "./FlatGenerator";
import FlatRemover from "./FlatRemover";

const PARTS = [["SOCIETY", "Society"], ["TOWERS", "Towers"], ["FLOORS", "Floors & flats"], ["RATES", "Rates"]] as const;
type Part = (typeof PARTS)[number][0];

const Chip = ({ children, tone }: { children: React.ReactNode; tone?: "gold" | "navy" }) => (
  <span className={`mono text-[10px] px-2 py-1 border rounded-[2px] ${tone === "gold" ? "bg-amber-400 text-black border-amber-400" : tone === "navy" ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>{children}</span>
);

export default function FlatSetupPanel({ ctx }: { ctx: Ctx }) {
  const { flats, towers, categories } = ctx;
  const [part, setPart] = useState<Part>("SOCIETY");
  const [tower, setTower] = useState<string>("");
  const views = useMemo(() => towerViews(flats, towers), [flats, towers]);
  const ex = useMemo(() => numberingExceptions(flats), [flats]);
  const plain = useMemo(() => flats.filter(followsPattern).length, [flats]);
  const cur = views.find((v) => v.code === tower) || views[0];
  const locked = flats.length > 0;

  return (
    <div id="panel-flat-setup" className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 sm:p-6 min-w-0 scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="serif text-[20px] sm:text-[22px] font-bold">FLAT SETUP</div>
          <div className="mono text-[11px] opacity-60 mt-1">How this society is set up: society, towers, floors, flats and rates.</div>
        </div>
        <Chip tone="navy">{locked ? "IN USE" : "NOT IN USE YET"}</Chip>
      </div>
      {locked && (
        <div className="mt-3 border border-amber-200 bg-[#fffbeb] p-3 mono text-[11px] leading-relaxed">
          {flats.length} flats already exist, so their floors, flat numbers, tower codes, terrace settings and rates cannot be changed here. The main admin can change the society details and tower names, add flats to a tower that has none, and remove flats that hold no data. Owner names are never shown here.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PARTS.map(([k, t]) => (
          <button key={k} onClick={() => setPart(k)} className={`min-h-[44px] mono text-[11px] font-semibold tracking-[0.06em] border rounded-[3px] px-2 ${part === k ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--surface)] border-[var(--border)]"}`}>{t.toUpperCase()}</button>
        ))}
      </div>

      {part === "SOCIETY" && <SocietyDetails ctx={ctx} />}

      {part === "TOWERS" && <TowerEditor ctx={ctx} />}

      {part === "FLOORS" && <FlatGenerator ctx={ctx} />}

      {part === "FLOORS" && locked && cur && (
        <div className="mt-4 space-y-4 min-w-0">
          <div className="flex flex-wrap gap-2">
            {views.map((v) => (
              <button key={v.code} onClick={() => setTower(v.code)} className={`min-h-[44px] min-w-[44px] px-4 mono text-[12px] font-semibold border rounded-[3px] ${cur.code === v.code ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-[var(--surface)] border-[var(--border)]"}`}>{v.code}</button>
            ))}
          </div>
          <div className="border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 mono text-[11px] leading-relaxed">
            <b>{cur.name}</b>: {cur.flats} flat{cur.flats === 1 ? "" : "s"} on {cur.floors.length} floor{cur.floors.length === 1 ? "" : "s"}{cur.perFloor ? ` (${cur.perFloor} per floor)` : ""}.<br />
            First flat {cur.first || "—"} • last flat {cur.last || "—"}
          </div>
          <div className="grid gap-2">
            {cur.floors.map((r) => (
              <div key={r.floor} className="border border-[var(--border)] rounded-[3px] p-2.5 min-w-0">
                <div className="mono text-[10px] opacity-60 mb-1.5">FLOOR {r.floor} • {r.flats.length} FLAT{r.flats.length > 1 ? "S" : ""}</div>
                <div className="flex flex-wrap gap-1.5">{r.flats.map((n) => <Chip key={n}>{n}</Chip>)}</div>
              </div>
            ))}
          </div>

          <div className="border border-[var(--border)] bg-[var(--bg)] rounded-[3px] p-3 mono text-[11px] leading-relaxed">
            <div className="font-bold tracking-[0.06em]">NUMBERING</div>
            <div className="mt-1">{plain} of {flats.length} flats follow the plain pattern: tower letter + floor + 2-digit unit (A-1003 is tower A, floor 10, unit 03).</div>
            {(ex.joined.length > 0 || ex.otherLetter.length > 0) && <div className="mt-2 opacity-80">The others are exceptions. A new society does not need them:</div>}
            {ex.joined.map((g) => <div key={`j${g.tower}`} className="mt-2"><b>Joined homes in Tower {g.tower}</b> (one home, two numbers): {g.flats.join(", ")}</div>)}
            {ex.otherLetter.map((g) => <div key={`o${g.tower}`} className="mt-2"><b>Tower {g.tower}</b> holds flats numbered with another letter: {g.flats.join(", ")}</div>)}
          </div>
        </div>
      )}

      {part === "FLOORS" && locked && <FlatRemover ctx={ctx} />}

      {part === "RATES" && (
        <div className="mt-4 grid gap-3">
          {categories.map((c) => (
            <div key={c.key} className={`border rounded-[3px] p-3 min-w-0 ${c.terrace ? "bg-[#fff8d6] border-amber-300" : "bg-[var(--bg)] border-[var(--border)]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="mono text-[11px] font-bold tracking-[0.06em] min-w-0 break-words">{c.label}</div>
                {c.terrace ? <Chip tone="gold">TERRACE</Chip> : <Chip>STANDARD</Chip>}
              </div>
              <div className="mono text-[11px] mt-2 leading-relaxed">
                {c.ids.length} flat{c.ids.length === 1 ? "" : "s"} • {c.range}<br />
                Maintenance {c.maint == null ? "not set" : `${rupees(c.maint)} / year`} • {c.sqft == null ? "area not set" : `${c.sqft} sq ft`} • {c.bhk || "type not set"}
              </div>
            </div>
          ))}
          <div className="mono text-[10px] opacity-60">Rates are changed in the charges panel above (SOCIETY CHARGES CONTROL PANEL).</div>
        </div>
      )}
    </div>
  );
}
