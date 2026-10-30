"use client";
// "Who to contact": the committee member responsible for each area (set in COMMITTEE → RESPONSIBILITIES).
import { useEffect, useState } from "react";
import type { Flat } from "@/lib/society";
import { backupsOf, loadAreas, personOf, type Area } from "@/lib/committee";

export function useContacts() {
  const [areas, setAreas] = useState<Area[] | null>(null);
  useEffect(() => { loadAreas().then(setAreas); }, []);
  return (areas || []).filter((a) => a.holder_flat);
}

export default function WhoToContact({ flats, isCommittee, areas, id, className = "" }: { flats: Flat[]; isCommittee: boolean; areas: Area[]; id?: string; className?: string }) {
  if (!areas.length) return null;
  return (
    <div id={id} className={`scroll-mt-28 ${className}`}>
      <div className="mono text-[11px] font-bold tracking-[0.16em]">WHO TO CONTACT</div>
      <div className="mono text-[10px] opacity-60 mt-0.5">The committee member responsible for each area{isCommittee ? " • change in COMMITTEE → RESPONSIBILITIES" : ""}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {areas.map((a) => { const p = personOf(flats, a.holder_flat); return (
          <div key={a.id} className="border border-[var(--border)] bg-[var(--bg)] p-3 mono text-[11px]">
            <div className="font-bold text-[12px]">{a.name}</div>
            {a.description && <div className="opacity-60 text-[10px]">{a.description}</div>}
            <div className="mt-1.5"><b className="text-[var(--navy)]">{p?.name}</b>{p?.role ? ` • ${p.role}` : ""}{p?.flat ? ` • ${p.flat}` : ""}</div>
            {backupsOf(a).length > 0 && <div className="opacity-70 text-[10px] mt-0.5">Backup: {backupsOf(a).map((b) => personOf(flats, b)?.name).filter(Boolean).join(", ")}</div>}
            {a.contact_phone && <a href={`tel:${a.contact_phone.replace(/\s+/g, "")}`} className="underline mt-0.5 inline-block">📞 {a.contact_phone}</a>}
          </div>); })}
      </div>
    </div>
  );
}
