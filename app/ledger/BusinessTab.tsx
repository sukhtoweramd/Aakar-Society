"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, SOCIETY } from "@/lib/society";
import { backBar } from "@/lib/printBack";
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
  const esc = (v: any) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  function printDirectory() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to print."); return; }
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const scope = [cat === "ALL" ? "All categories" : cat, s ? `search "${q.trim()}"` : ""].filter(Boolean).join(" • ");
    const groups = Array.from(new Set(shown.map((e) => e.business_category || "Other")));
    const body = groups.map((g) => `<tr class="grp"><td colspan="5">${esc(g)}</td></tr>` + shown.filter((e) => (e.business_category || "Other") === g).map((e) =>
      `<tr><td class="f">${esc(flatLabel(e.flat_id))}</td><td><b>${esc(e.name)}</b></td><td>${esc(e.business_name || "")}${e.business_name && e.occupation ? "<br>" : ""}<span class="m">${esc(e.occupation || "")}</span></td><td>${esc(e.office_address || "")}</td><td class="nw">${esc(e.office_phone || "")}</td></tr>`).join("")).join("");
    w.document.write(`<html><head><meta charset="utf-8"><title>Business Directory ${esc(today)}</title><style>
      @page{size:A4 portrait;margin:12mm 10mm 14mm;
        @bottom-left{content:"${esc(SOCIETY.full)} • Members' Business & Profession Directory • ${esc(today)} • For members only";font:8.5px Inter,Arial,sans-serif;color:#7a7568}
        @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8.5px Inter,Arial,sans-serif;color:#7a7568}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Inter,Arial,sans-serif;margin:0;color:#1a1a18}
      h1{font-size:17px;color:#0f1d3d;margin:0}.sub{font-size:11px;color:#6f6a5d;margin:3px 0 10px}
      .head{border-bottom:2px solid #0f1d3d;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
      .head .r{font-size:11px;color:#6f6a5d;text-align:right}
      table{width:100%;border-collapse:collapse;font-size:11px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
      th{background:#0f1d3d;color:#fff;text-align:left;padding:5px 6px;font-size:10px;letter-spacing:.06em}
      td{padding:5px 6px;border-bottom:1px solid #e8e2d1;vertical-align:top}
      tr.grp td{background:#f7f2e4;color:#8a6d14;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:10px;border-top:1px solid #d9d1bb}
      .f{font-weight:700;white-space:nowrap}.nw{white-space:nowrap}.m{color:#6f6a5d}
      .bar{position:sticky;top:0}
      @media screen{body{padding:24px;max-width:794px;margin:auto}}
    </style></head><body>${backBar(`<span>${shown.length} listing${shown.length === 1 ? "" : "s"} • ${esc(scope)}</span>`)}
      <div class="head"><div><h1>ॐ ${esc(SOCIETY.full)}</h1><div class="sub">${esc(SOCIETY.building)} • Reg. ${esc(SOCIETY.reg)}</div>
        <div style="font-size:15px;font-weight:800;color:#0f1d3d">Members' Business &amp; Profession Directory</div></div>
        <div class="r">${esc(scope)}<br>${shown.length} listing${shown.length === 1 ? "" : "s"} • as on ${esc(today)}</div></div>
      <table><thead><tr><th style="width:9%">FLAT</th><th style="width:20%">NAME</th><th style="width:26%">BUSINESS / PROFESSION</th><th style="width:31%">OFFICE ADDRESS</th><th style="width:14%">PHONE</th></tr></thead>
      <tbody>${body || `<tr><td colspan="5" style="text-align:center;color:#6f6a5d;padding:16px">No listings.</td></tr>`}</tbody></table>
      <div style="margin-top:12px;font-size:10px;color:#6f6a5d">For members of ${esc(SOCIETY.full)} only. Please do not share outside the society.</div>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
  }
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
            <button onClick={printDirectory} disabled={!shown.length} className="btn-navy mono text-[11px] px-4 py-2 tracking-[0.06em] disabled:opacity-40" title="Prints what is shown: the chosen category and search">🖨 PRINT DIRECTORY</button>
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
