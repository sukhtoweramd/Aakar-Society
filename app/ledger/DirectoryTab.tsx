"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SOCIETY, byCommitteeRole, byFamilyOrder, filterName } from "@/lib/society";
import type { Ctx } from "./ctx";
import { backButton, pdfButton } from "@/lib/printBack";

type Row = { flat_id: string; tower: string | null; floor: number | null; owner_name: string | null; is_committee: boolean | null; consent: boolean; member_id: string | null; member_name: string | null; relation: string | null; mobile: string | null; is_head: boolean; occupancy?: string | null; tenant_name?: string | null; committee_role?: string | null };
type Entry = { flat_id: string; tower: string | null; owner_name: string | null; is_committee: boolean; role: string | null; consent: boolean; tenant: string | null; members: Row[] };

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const flatLabel = (id: string) => { const m = id.match(/^([A-Z])(\d+)$/); return m ? `${m[1]}-${m[2]}` : id; };
// Long names are cut to keep the portrait page tidy, e.g. "BHUPESH D MEHTA & HINA B MEH…"
const MAX_NAME = 36;
const cut = (s?: string | null) => { const t = (s || "").trim(); return t.length > MAX_NAME ? t.slice(0, MAX_NAME - 1).trimEnd() + "…" : t; };
const num = (id: string) => parseInt(id.replace(/\D/g, ""), 10) || 0;

export default function DirectoryTab({ ctx }: { ctx: Ctx }) {
  const { towerFilter, categories, homeFlat, go, selectFlat } = ctx;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [onlyShared, setOnlyShared] = useState(false);
  const [who, setWho] = useState<"ALL" | "OWNERS" | "TENANTS">("ALL");

  // who of the family is on the committee (COMMITTEE_PERSON.sql), shown next to the designation when not the owner
  const [cp, setCp] = useState<Record<string, string>>({});
  const [cpl, setCpl] = useState<Record<string, { name: string; role: string }[]>>({});
  useEffect(() => { supabase.rpc("committee_people").then(({ data, error }) => { if (!error) { setCp(Object.fromEntries(((data as any[]) || []).map((r) => [r.flat_id, (r.people || []).map((p: any) => p.name).join(" ") || r.person || ""]))); setCpl(Object.fromEntries(((data as any[]) || []).filter((r) => Array.isArray(r.people)).map((r) => [r.flat_id, r.people]))); } }); }, []);
  // "★ Committee Member" when it is the owner; otherwise "★ Committee Member: NAME • Co-opted Member: NAME"
  const badgeOf = (e: Entry) => {
    const ps = cpl[e.flat_id] || [];
    const own = (e.owner_name || "").trim().toLowerCase();
    if (!ps.length || (ps.length === 1 && ps[0].name.trim().toLowerCase() === own)) return `★ ${e.role || "Committee"}`;
    return "★ " + ps.map((p) => `${p.role}: ${p.name}`).join(" • ");
  };
  useEffect(() => {
    supabase.from("member_directory").select("*").then(({ data, error }) => {
      if (error) setError(/member_directory/.test(error.message) ? "The member directory needs a one-time database step (DIRECTORY_CONSENT.sql) to be run by the committee." : error.message);
      setRows((data as Row[]) || []);
    });
  }, []);

  const entries: Entry[] = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const r of rows || []) {
      if (!map.has(r.flat_id)) map.set(r.flat_id, { flat_id: r.flat_id, tower: r.tower, owner_name: r.owner_name, is_committee: !!r.is_committee, role: r.committee_role || null, consent: !!r.consent, tenant: r.occupancy === "tenant" ? r.tenant_name || "Tenant" : null, members: [] });
      if (r.member_id) map.get(r.flat_id)!.members.push(r);
    }
    const list = Array.from(map.values());
    list.forEach((e) => e.members.sort((a, b) => byFamilyOrder({ ...a, name: a.member_name }, { ...b, name: b.member_name })));
    return list.sort((a, b) => (a.tower || "").localeCompare(b.tower || "") || num(a.flat_id) - num(b.flat_id));
  }, [rows]);

  const s = q.trim().toLowerCase();
  const shown = entries.filter((e) =>
    (towerFilter === "ALL" || (towerFilter === "COMMITTEE" ? e.is_committee : e.tower === towerFilter)) &&
    (!onlyShared || e.consent) &&
    (who === "ALL" || (who === "TENANTS" ? !!e.tenant : !e.tenant)) &&
    (!s || flatLabel(e.flat_id).toLowerCase().includes(s) || (e.owner_name || "").toLowerCase().includes(s) || (cp[e.flat_id] || "").toLowerCase().includes(s) || (e.tenant || "").toLowerCase().includes(s) ||
      e.members.some((m) => (m.member_name || "").toLowerCase().includes(s) || (m.mobile || "").replace(/\s/g, "").includes(s.replace(/\s/g, "")))));
  if (towerFilter === "COMMITTEE") shown.sort((a, b) => byCommitteeRole({ committee_role: a.role, tower: a.tower, id: a.flat_id }, { committee_role: b.role, tower: b.tower, id: b.flat_id }));
  const sharedCount = entries.filter((e) => e.consent).length;
  const mine = entries.find((e) => e.flat_id === homeFlat);
  const scope = filterName(towerFilter, categories) + (who === "OWNERS" ? " • owners living in their flat" : who === "TENANTS" ? " • rented flats (tenants)" : "");

  function printPdf() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to create the PDF."); return; }
    const today = new Date().toLocaleDateString("en-IN");
    const sharing = shown.filter((e) => e.consent).length;
    const flatBlock = (e: Entry) => {
      const name = e.tenant
        ? `<b>${esc(cut(e.tenant))}</b> <span class="muted">(tenant)</span><div class="muted small">Owner: ${esc(cut(e.owner_name) || "not recorded")}</div>`
        : e.owner_name ? `<b>${esc(cut(e.owner_name))}</b>` : `<span class="muted">Owner not recorded</span>`;
      const role = e.is_committee ? ` <span class="gold">${esc(badgeOf(e))}</span>` : "";
      const note = e.consent ? (e.members.length ? "" : ' <span class="muted">· no family members added yet</span>') : ' <span class="muted">· details not shared</span>';
      const fam = e.members.map((m) => `<tr class="fam"><td></td><td>${esc(cut(m.member_name))}</td><td>${esc(m.relation)}</td><td>${esc(m.mobile)}</td></tr>`).join("");
      // one <tbody> per flat so a family is never split across two pages
      return `<tbody class="grp"><tr class="flat"><td><b>${esc(flatLabel(e.flat_id))}</b></td><td colspan="3">${name}${role}${note}</td></tr>${fam}</tbody>`;
    };
    // Committee filter: one "COMMITTEE" section ordered Chairman, Secretary, Treasurer …; otherwise one section per tower.
    const committeeOnly = towerFilter === "COMMITTEE";
    const groups: [string, Entry[]][] = committeeOnly
      ? [["COMMITTEE", [...shown].sort((a, b) => byCommitteeRole({ committee_role: a.role, tower: a.tower, id: a.flat_id }, { committee_role: b.role, tower: b.tower, id: b.flat_id }))]]
      : Array.from(new Set(shown.map((e) => e.tower || "?"))).map((t) => [`TOWER ${t}`, shown.filter((e) => (e.tower || "?") === t)]);
    const docTitle = committeeOnly ? "COMMITTEE DIRECTORY" : "MEMBER DIRECTORY";
    const sections = groups.map(([t, list], i) => {
      return `<table class="${i ? "newpage" : ""}"><thead>
        <tr class="title"><td colspan="4"><div class="row"><div><h1>ॐ AAKAR CO-OP HOUSING SOCIETY LTD. — ${docTitle}</h1>
          <div class="sub">${esc(SOCIETY.building)} • REG ${esc(SOCIETY.reg)} • ${esc(today)} • ${esc(scope)} • Family details only for flats that gave consent</div></div>
          <div class="tower">${esc(t)}</div></div></td></tr>
        <tr class="gap"><td colspan="4"></td></tr>
        <tr><th style="width:13%">Flat</th><th style="width:47%">Resident / family member</th><th style="width:17%">Relation</th><th style="width:23%">Mobile</th></tr>
      </thead>${list.map(flatBlock).join("")}</table>`;
    }).join("");
    w.document.write(`<html><head><title>Aakar Co-op - ${committeeOnly ? "Committee" : "Member"} Directory ${esc(today)}</title><style>
      @page{size:A4 portrait;margin:12mm 10mm 15mm;
        @bottom-left{content:"Aakar Co-op • ${committeeOnly ? "Committee" : "Member"} Directory • ${esc(today)} • Shared with consent – not for circulation outside the society";font:8px Inter,Arial,sans-serif;color:#7a7568}
        @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Inter,Arial,sans-serif;color:#7a7568}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;margin:0;color:#1a1a18}
      table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed} td{overflow:hidden;white-space:nowrap;text-overflow:ellipsis} .small{font-size:9.5px;margin-top:1px} thead{display:table-header-group}
      tbody.grp{break-inside:avoid;page-break-inside:avoid} tr{break-inside:avoid}
      table.newpage{break-before:page;page-break-before:always}
      .title td{border:0;border-bottom:2px solid #0f1d3d;padding:0 0 7px} .row{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-right:3px}
      h1{margin:0;color:#0f1d3d;font-size:15px;letter-spacing:.02em} .sub{font-size:9.5px;color:#7a7568;margin-top:2px}
      .tower{font-size:14px;font-weight:700;color:#0f1d3d;border:1.5px solid #0f1d3d;padding:3px 10px;white-space:nowrap}
      th{background:#0f1d3d;color:#fff;text-align:left;padding:5px 7px} td{padding:4px 7px;vertical-align:top}
      tr.flat td{background:#f7f2e4;border-top:1px solid #d9d1bb} tr.fam td{border-top:1px dotted #e8e2d1}
      .gold{color:#b8932a;font-weight:600} .muted{color:#7a7568;font-weight:400}
      .gap td{border:0;height:6px;padding:0}
      .bar{position:sticky;top:0;z-index:5;background:#0f1d3d;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:13px;margin:-24px -24px 18px}
      .bar button{background:#c9a227;color:#000;border:0;padding:8px 16px;font-weight:700;cursor:pointer}
      @media screen{body{padding:24px;max-width:794px;margin:auto} table{margin-bottom:28px}}
      @media print{.bar{display:none}}
    </style></head><body>
      <div class="bar">${backButton()}${pdfButton()}<button onclick="window.print()">PRINT</button>
        <span>${shown.length} flats • ${sharing} sharing family details • Heading repeats and page numbers appear in the print preview (choose "Save as PDF").</span></div>
      ${sections}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5 flex flex-wrap justify-between gap-3 items-start">
        <div>
          <div className="serif text-[22px] font-bold">{towerFilter === "COMMITTEE" ? "Committee Directory" : "Member Directory"}</div>
          <div className="mono text-[11px] opacity-60 mt-1">{scope} • {sharedCount} of {entries.length} flats share family details • Use it to know who is who in the society WhatsApp group</div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, flat or mobile" className="mono text-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 w-[220px] rounded-[2px] outline-none focus:border-[var(--gold)]" />
          <select value={who} onChange={(e) => setWho(e.target.value as any)} className="mono text-[11px] border border-[var(--border)] bg-[var(--bg)] px-2 py-2 rounded-[2px]" title="Show all flats, only owner-occupied flats, or only rented flats">
            <option value="ALL">All residents</option><option value="OWNERS">Owners living here</option><option value="TENANTS">Tenants only</option></select>
          <label className="mono text-[11px] flex items-center gap-1.5"><input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} /> Only flats sharing details</label>
          <button onClick={printPdf} disabled={!rows?.length} className="btn-navy mono text-[11px] px-3 py-2 tracking-[0.08em]">PDF</button>
        </div>
      </div>

      {mine && !mine.consent && (
        <div className="border border-amber-300 bg-[#fff8d6] p-3 mono text-[11px] flex flex-wrap gap-3 items-center justify-between">
          <span>Your family details are not shared. Tick the consent box in MY FLAT to show your family names and mobiles here.</span>
          <button onClick={() => { selectFlat(mine.flat_id); go("DETAIL"); }} className="btn-navy px-3 py-1.5">OPEN MY FLAT</button>
        </div>
      )}
      {error && <div className="border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((e) => (
          <div key={e.flat_id} className={`border rounded-[4px] p-4 bg-[var(--surface)] ${e.consent ? "border-[var(--border)]" : "border-dashed border-[var(--border)]"}`}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="mono text-[11px] font-bold tracking-[0.08em]">{flatLabel(e.flat_id)}{e.is_committee && <span className="text-[var(--gold)] ml-1">{badgeOf(e)}</span>}</div>
                {e.tenant ? <>
                  <div className="serif text-[15px] font-bold mt-0.5">{e.tenant} <span className="mono text-[9px] bg-[var(--navy)] text-white px-1 align-middle">TENANT</span></div>
                  <div className="mono text-[10px] opacity-60">Owner: {e.owner_name || "not recorded"}</div>
                </> : <div className="serif text-[15px] font-bold mt-0.5">{e.owner_name || <span className="opacity-40">Owner not recorded</span>}</div>}
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
