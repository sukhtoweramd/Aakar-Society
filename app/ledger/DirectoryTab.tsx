"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SOCIETY, filterName } from "@/lib/society";
import type { Ctx } from "./ctx";

type Row = { flat_id: string; tower: string | null; floor: number | null; owner_name: string | null; is_committee: boolean | null; consent: boolean; member_id: string | null; member_name: string | null; relation: string | null; mobile: string | null; is_head: boolean };
type Entry = { flat_id: string; tower: string | null; owner_name: string | null; is_committee: boolean; consent: boolean; members: Row[] };

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const flatLabel = (id: string) => { const m = id.match(/^([A-Z])(\d+)$/); return m ? `${m[1]}-${m[2]}` : id; };
const num = (id: string) => parseInt(id.replace(/\D/g, ""), 10) || 0;

export default function DirectoryTab({ ctx }: { ctx: Ctx }) {
  const { towerFilter, categories, myFlat, go, isCommittee } = ctx;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [onlyShared, setOnlyShared] = useState(false);

  useEffect(() => {
    supabase.from("member_directory").select("*").then(({ data, error }) => {
      if (error) setError(/member_directory/.test(error.message) ? "The member directory needs a one-time database step (DIRECTORY_CONSENT.sql) to be run by the committee." : error.message);
      setRows((data as Row[]) || []);
    });
  }, []);

  const entries: Entry[] = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const r of rows || []) {
      if (!map.has(r.flat_id)) map.set(r.flat_id, { flat_id: r.flat_id, tower: r.tower, owner_name: r.owner_name, is_committee: !!r.is_committee, consent: !!r.consent, members: [] });
      if (r.member_id) map.get(r.flat_id)!.members.push(r);
    }
    const list = Array.from(map.values());
    list.forEach((e) => e.members.sort((a, b) => Number(b.is_head) - Number(a.is_head) || (a.member_name || "").localeCompare(b.member_name || "")));
    return list.sort((a, b) => (a.tower || "").localeCompare(b.tower || "") || num(a.flat_id) - num(b.flat_id));
  }, [rows]);

  const s = q.trim().toLowerCase();
  const shown = entries.filter((e) =>
    (towerFilter === "ALL" || (towerFilter === "COMMITTEE" ? e.is_committee : e.tower === towerFilter)) &&
    (!onlyShared || e.consent) &&
    (!s || flatLabel(e.flat_id).toLowerCase().includes(s) || (e.owner_name || "").toLowerCase().includes(s) ||
      e.members.some((m) => (m.member_name || "").toLowerCase().includes(s) || (m.mobile || "").replace(/\s/g, "").includes(s.replace(/\s/g, "")))));
  const sharedCount = entries.filter((e) => e.consent).length;
  const mine = entries.find((e) => e.flat_id === myFlat);
  const scope = filterName(towerFilter, categories);

  function printPdf() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to create the PDF."); return; }
    const today = new Date().toLocaleDateString("en-IN");
    const body = shown.map((e) => {
      const head = `<tr class="flat"><td><b>${esc(flatLabel(e.flat_id))}</b></td><td colspan="3"><b>${esc(e.owner_name || "—")}</b>${e.is_committee ? ' <span class="gold">★ Committee</span>' : ""}${e.consent ? "" : ' <span class="muted">· details not shared</span>'}</td></tr>`;
      const fam = e.members.map((m) => `<tr><td></td><td>${esc(m.member_name)}</td><td>${esc(m.relation)}</td><td>${esc(m.mobile)}</td></tr>`).join("");
      return head + fam;
    }).join("");
    w.document.write(`<html><head><title>Aakar Co-op - Member Directory ${esc(today)}</title><style>
      @page{size:A4 portrait;margin:12mm 10mm 14mm;
        @bottom-left{content:"Aakar Co-op • Member Directory • ${esc(today)} • Shared with consent – not for circulation outside the society";font:8.5px Inter,Arial,sans-serif;color:#7a7568}
        @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Inter,Arial,sans-serif;color:#7a7568}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-family:Inter,Arial,sans-serif;margin:0;color:#1a1a18}
      table{width:100%;border-collapse:collapse;font-size:11px} thead{display:table-header-group} tr{break-inside:avoid}
      .title td{border:0;border-bottom:2px solid #0f1d3d;padding:0 0 8px} h1{margin:0;color:#0f1d3d;font-size:17px} .sub{font-size:10px;color:#7a7568}
      th{background:#0f1d3d;color:#fff;text-align:left;padding:5px 7px} td{padding:4px 7px;border-bottom:1px solid #eee7d6;vertical-align:top}
      tr.flat td{background:#f7f2e4;border-top:1px solid #e8e2d1} .gold{color:#b8932a;font-weight:600} .muted{color:#7a7568;font-weight:400}
      .gap td{border:0;height:6px;padding:0} @media screen{body{padding:24px}}
    </style></head><body><table><thead>
      <tr class="title"><td colspan="4"><h1>ॐ AAKAR CO-OP HOUSING SOCIETY LTD. — MEMBER DIRECTORY</h1><div class="sub">${esc(SOCIETY.building)} • REG ${esc(SOCIETY.reg)} • ${esc(scope)} • ${esc(today)} • Family details only for flats that gave consent</div></td></tr>
      <tr class="gap"><td colspan="4"></td></tr>
      <tr><th style="width:10%">Flat</th><th style="width:44%">Owner / family member</th><th style="width:18%">Relation</th><th>Mobile</th></tr>
    </thead><tbody>${body}</tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 flex flex-wrap justify-between gap-3 items-start">
        <div>
          <div className="serif text-[22px] font-bold">Member Directory</div>
          <div className="mono text-[11px] opacity-60 mt-1">{scope} • {sharedCount} of {entries.length} flats share family details • Use it to know who is who in the society WhatsApp group</div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, flat or mobile" className="mono text-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 w-[220px] rounded-[2px] outline-none focus:border-[var(--gold)]" />
          <label className="mono text-[11px] flex items-center gap-1.5"><input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} /> Only flats sharing details</label>
          <button onClick={printPdf} disabled={!rows?.length} className="btn-navy mono text-[11px] px-3 py-2 tracking-[0.08em]">PDF</button>
        </div>
      </div>

      {!isCommittee && mine && !mine.consent && (
        <div className="border border-amber-300 bg-[#fff8d6] p-3 mono text-[11px] flex flex-wrap gap-3 items-center justify-between">
          <span>Your family details are not shared. Tick the consent box in MY FLAT to show your family names and mobiles here.</span>
          <button onClick={() => go("DETAIL")} className="btn-navy px-3 py-1.5">OPEN MY FLAT</button>
        </div>
      )}
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((e) => (
          <div key={e.flat_id} className={`border rounded-[4px] p-4 bg-[var(--surface)] ${e.consent ? "border-[var(--border)]" : "border-dashed border-[var(--border)]"}`}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="mono text-[11px] font-bold tracking-[0.08em]">{flatLabel(e.flat_id)}{e.is_committee && <span className="text-[var(--gold)] ml-1">★ Committee</span>}</div>
                <div className="serif text-[15px] font-bold mt-0.5">{e.owner_name || <span className="opacity-40">Owner not recorded</span>}</div>
              </div>
              {!e.consent && <span className="mono text-[9px] opacity-50 shrink-0">details not shared</span>}
            </div>
            {e.consent && (
              <div className="mt-2 divide-y divide-[var(--border)]">
                {e.members.length === 0 && <div className="mono text-[11px] opacity-50 py-1">No family members added yet</div>}
                {e.members.map((m) => (
                  <div key={m.member_id} className="py-1.5 flex justify-between gap-2 text-[13px]">
                    <span>{m.member_name}{m.relation && <span className="opacity-60 text-[11px]"> · {m.relation}</span>}</span>
                    {m.mobile && <a href={`tel:${m.mobile.replace(/\s/g, "")}`} className="mono text-[12px] underline shrink-0">{m.mobile}</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {rows && shown.length === 0 && !error && <div className="md:col-span-2 xl:col-span-3 border border-dashed border-[var(--border)] p-6 text-center mono text-[12px] opacity-60">No match.</div>}
        {!rows && <div className="mono text-[12px] opacity-60">Loading…</div>}
      </div>
    </div>
  );
}
