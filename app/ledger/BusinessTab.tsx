"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label } from "@/lib/society";
import type { Ctx } from "./ctx";

type Entry = { id: string; flat_id: string | null; name: string | null; occupation: string | null; business_name: string | null; business_category: string | null; office_address: string | null; office_phone: string | null; tower: string | null };

export default function BusinessTab({ ctx }: { ctx: Ctx }) {
  const { isCommittee, myFlat, selectFlat, go } = ctx;
  const [list, setList] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");

  useEffect(() => {
    supabase.from("business_directory").select("*").then(({ data, error }) => {
      if (error) setError(/business_directory/.test(error.message) ? "The Business Directory needs the latest database step (RESIDENT_ACCESS.sql) to be run in Supabase." : error.message);
      setList(((data as Entry[]) || []).sort((a, b) => (a.business_category || "zz").localeCompare(b.business_category || "zz") || (a.name || "").localeCompare(b.name || "")));
      setLoaded(true);
    });
  }, []);

  const flatLabel = (id: string | null) => (id ? label({ id, flat_no: id } as any) : "—");
  const categories = Array.from(new Set(list.map((e) => e.business_category || "Other"))).sort();
  const s = q.trim().toLowerCase();
  const shown = list.filter((e) =>
    (cat === "ALL" || (e.business_category || "Other") === cat) &&
    (!s || [e.name, e.occupation, e.business_name, e.business_category, e.office_address, flatLabel(e.flat_id)].some((v) => (v || "").toLowerCase().includes(s))));
  const openFlat = (id: string | null) => { if (!id) return; if (isCommittee) { selectFlat(id); go("DETAIL"); } else if (id === myFlat) go("DETAIL"); };

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div>
            <div className="serif text-[24px] font-bold">Members&apos; Business & Profession Directory</div>
            <div className="mono text-[11px] opacity-60">{list.length} listings • built automatically from each flat&apos;s family members</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="mono text-[12px] border border-[var(--border)] bg-[var(--bg)] px-2 py-2 rounded-[2px]">
              <option value="ALL">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doctor, CA, name…" className="mono text-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 w-[220px] rounded-[2px] outline-none focus:border-[var(--gold)]" />
          </div>
        </div>
        {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((e) => (
            <button key={e.id} onClick={() => openFlat(e.flat_id)} className="text-left border border-[var(--border)] bg-[var(--bg)] p-4 hover:border-[var(--gold)]">
              <div className="flex justify-between gap-2 items-start">
                <div className="mono text-[9px] tracking-[0.16em] bg-[var(--navy)] text-white inline-block px-2 py-0.5">{(e.business_category || "OTHER").toUpperCase()}</div>
                <div className="mono text-[10px] opacity-60">{flatLabel(e.flat_id)}</div>
              </div>
              <div className="serif text-[15px] font-bold mt-2">{e.business_name || e.occupation || e.name}</div>
              <div className="mono text-[11px] mt-0.5">{e.name}{e.occupation && e.business_name ? ` • ${e.occupation}` : ""}</div>
              {e.office_address && <div className="mono text-[10px] mt-2 opacity-70">📍 {e.office_address}</div>}
              {e.office_phone && <div className="mono text-[10px] mt-1"><a href={`tel:${e.office_phone.replace(/\s/g, "")}`} onClick={(x) => x.stopPropagation()} className="underline">☎ {e.office_phone}</a></div>}
            </button>
          ))}
          {loaded && shown.length === 0 && !error && (
            <div className="md:col-span-2 xl:col-span-3 border border-dashed border-[var(--border)] p-6 text-center mono text-[12px] opacity-60">
              {list.length ? "No match." : "No business or profession details yet."}
            </div>
          )}
        </div>
      </div>
      <div className="bg-[#fffbeb] border border-amber-200 rounded-[4px] p-4 mono text-[11px] leading-relaxed">
        <div className="font-bold tracking-[0.08em]">HOW TO GET LISTED</div>
        <div className="mt-1 opacity-80">
          Open {isCommittee ? "a flat in DETAIL" : "MY FLAT"} → FAMILY MEMBERS → Edit (or + ADD MEMBER) and fill in Profession / Business, office address and office phone. It appears here automatically.
        </div>
        <button onClick={() => (isCommittee ? go("INDEX") : go("DETAIL"))} className="btn-navy mt-3 px-3 py-1.5 text-[11px]">{isCommittee ? "GO TO INDEX" : "OPEN MY FLAT"}</button>
      </div>
    </div>
  );
}
