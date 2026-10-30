"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { familySummary, filterName, inFilter, floorOf, isOccupied, label, rupees, SOCIETY, type MemberLite } from "@/lib/society";
import type { Ctx } from "./ctx";
import VehicleReport from "./VehicleReport";
import DocsReport from "./DocsReport";
import NominationReport from "./NominationReport";
import { printFlatCards } from "@/lib/flatCard";
import { backBar } from "@/lib/printBack";

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function ReportsTab({ ctx }: { ctx: Ctx }) {
  const { flats, towerFilter, categories } = ctx;
  const list = flats.filter((f) => inFilter(f, towerFilter, categories));
  const occupied = list.filter(isOccupied).length;
  const withOwner = list.filter((f) => f.owner_name).length;
  const annual = list.reduce((n, f) => n + (f.maintenance || 0), 0);
  const scope = filterName(towerFilter, categories);
  const [members, setMembers] = useState<MemberLite[]>([]);
  useEffect(() => {
    supabase.from("members").select("*").then(({ data }) => setMembers((data as MemberLite[]) || []));
  }, []);
  const fam = (f: (typeof flats)[number]) => familySummary(f, members);
  function exportCSV() {
    const headers = ["Flat", "Tower", "Floor", "Owner Name", "Lives here", "Tenant Name", "Rent agreement until", "Owner Mobile (if rented)", "Profession / Business", "Spouse", "Mobile", "Email", "Family Members", "Committee", "Status"];
    const rows = list.map((f) => { const x = fam(f); return [label(f), f.tower ?? "", floorOf(f), f.owner_name ?? "", f.occupancy === "tenant" ? "Tenant" : "Owner", f.tenant_name ?? "", f.agreement_until ?? "", f.occupancy === "tenant" ? f.owner_mobile ?? "" : "", x.profession, x.spouse?.name ?? "", x.mobile, f.email ?? "", x.count || "", f.is_committee ? f.committee_role || "Yes" : "", f.status ?? ""]; });
    const csv = "﻿" + [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Aakar_Society_Directory${towerFilter === "ALL" ? "" : `_${towerFilter}`}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to create the PDF."); return; }
    const today = new Date().toLocaleDateString("en-IN");
    const html = `<html><head><title>Aakar Co-op - Directory ${esc(today)}</title><style>
      @page{size:A4 landscape;margin:12mm 10mm 14mm;
        @bottom-left{content:"Aakar Co-op Housing Society Ltd. • ${esc(SOCIETY.reg)} • Directory ${esc(today)}";font:9px Inter,Arial,sans-serif;color:#7a7568}
        @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Inter,Arial,sans-serif;color:#7a7568}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Inter,Arial,sans-serif;margin:0;color:#1a1a18}
      table{width:100%;border-collapse:collapse;font-size:11px}
      thead{display:table-header-group} tr{break-inside:avoid;page-break-inside:avoid}
      .title td{border:0;border-bottom:2px solid #0f1d3d;padding:0 0 8px}
      .title .row{display:flex;justify-content:space-between;align-items:flex-end}
      h1{margin:0;color:#0f1d3d;font-size:18px;letter-spacing:.04em} .sub{font-size:10px;color:#7a7568;letter-spacing:.08em}
      .gap td{border:0;height:8px;padding:0}
      th{border:1px solid #0f1d3d;padding:5px 7px;text-align:left;background:#0f1d3d;color:#fff}
      tbody td{border:1px solid #e8e2d1;padding:5px 7px;text-align:left}
      tbody tr.r:nth-child(even) td{background:#fdfcf5} .gold{color:#b8932a}
      .intro td{border:0;padding:0 0 10px}
      .meta{font-size:11px;color:#444;margin-bottom:8px}
      @media screen{body{padding:24px}}
    </style></head><body>${backBar()}
      <table>
        <thead>
          <tr class="title"><td colspan="6"><div class="row"><div><h1>ॐ AAKAR CO-OP HOUSING SOCIETY LTD.</h1><div class="sub">${esc(SOCIETY.building)} • REG ${esc(SOCIETY.reg)} • ${esc(SOCIETY.address)}</div></div><div class="sub">DIRECTORY REPORT • ${esc(scope.toUpperCase())}</div></div></td></tr>
          <tr class="gap"><td colspan="6"></td></tr>
          <tr><th style="width:7%">Flat</th><th style="width:24%">Owner / Tenant</th><th style="width:22%">Profession / Business</th><th style="width:16%">Spouse</th><th style="width:11%">Mobile</th><th>Email</th></tr>
        </thead>
        <tbody>
          <tr class="intro"><td colspan="6">
            <div class="meta">Date: ${esc(today)} • ${esc(scope)} • Flats: ${list.length} • Owners recorded: ${withOwner} • On rent: ${list.filter((f) => f.occupancy === "tenant").length}</div>
          </td></tr>
          ${list.map((f) => { const x = fam(f); return `<tr class="r"><td><b>${esc(label(f))}</b></td><td>${esc(f.owner_name)}${f.is_committee ? ` <span class="gold">★ ${esc(f.committee_role || "")}</span>` : ""}${f.occupancy === "tenant" ? `<br><span style="font-size:10px">On rent to <b>${esc(f.tenant_name || "—")}</b></span>` : ""}</td><td>${esc(x.profession)}</td><td>${esc(x.spouse?.name)}</td><td>${esc(x.mobile)}</td><td>${esc(f.email || x.head?.email)}</td></tr>`; }).join("")}
        </tbody>
      </table></body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["FLATS", list.length], ["OCCUPIED", occupied], ["OWNERS RECORDED", withOwner], ["ANNUAL ₹", rupees(annual)]].map(([k, v]) => (
          <div key={k as string} className="bg-[var(--surface)] border border-[var(--border)] p-4">
            <div className="mono text-[10px] opacity-60 tracking-[0.12em]">{k}</div>
            <div className="serif text-[26px] font-bold mt-1">{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="serif text-[22px] font-bold">Directory Reports</div>
        <div className="mono text-[11px] opacity-60 mt-1">Scope: {scope} • Click a tower or floor card in the sidebar to export only those flats</div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mono text-[11px] font-bold tracking-[0.12em]">CSV / EXCEL</div>
            <div className="mono text-[10px] opacity-60 mt-1">All columns with headings • opens in Excel</div>
            <button onClick={exportCSV} className="btn-navy mono text-[12px] tracking-[0.1em] w-full py-2.5 mt-4">DOWNLOAD CSV</button>
          </div>
          <div className="border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mono text-[11px] font-bold tracking-[0.12em]">PDF REPORT</div>
            <div className="mono text-[10px] opacity-60 mt-1">Society letterhead + people table • tap SAVE / SHARE PDF (or PRINT on a computer)</div>
            <button onClick={exportPDF} className="btn-gold mono text-[12px] tracking-[0.1em] w-full py-2.5 mt-4">CREATE PDF</button>
          </div>
          <VehicleReport list={list} members={members} scope={scope} />
          <div className="sm:col-span-2 min-w-0"><DocsReport list={list} scope={scope} /></div>
          <div className="sm:col-span-2 min-w-0"><NominationReport list={list} onOpen={(id) => { ctx.selectFlat(id); ctx.go("DETAIL"); setTimeout(() => document.getElementById("sec-nominee")?.scrollIntoView({ behavior: "smooth" }), 600); }} /></div>
          <div className="border border-[var(--border)] bg-[var(--bg)] p-5 sm:col-span-2 flex flex-wrap justify-between items-center gap-3">
            <div>
              <div className="mono text-[11px] font-bold tracking-[0.12em]">FLAT PROFILE CARDS</div>
              <div className="mono text-[10px] opacity-60 mt-1">One A4 card per flat with family, vehicles, emergency contacts and documents • {scope}: {list.length} flats</div>
            </div>
            <button onClick={() => { if (list.length <= 10 || confirm(`Prepare ${list.length} cards (one page each)? This can take a few seconds.`)) printFlatCards(list, `Flat Profile Cards – ${scope}`); }} disabled={!list.length} className="btn-gold mono text-[12px] tracking-[0.1em] px-5 py-2.5">PRINT ALL CARDS</button>
          </div>
        </div>
      </div>
    </div>
  );
}
