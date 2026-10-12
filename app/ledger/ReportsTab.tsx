"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { familySummary, filterName, inFilter, floorOf, isOccupied, label, rupees, SOCIETY, type MemberLite } from "@/lib/society";
import type { Ctx } from "./ctx";

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function ReportsTab({ ctx }: { ctx: Ctx }) {
  const { flats, email, towerFilter, categories } = ctx;
  const list = flats.filter((f) => inFilter(f, towerFilter, categories));
  const occupied = list.filter(isOccupied).length;
  const withOwner = list.filter((f) => f.owner_name).length;
  const monthly = list.reduce((n, f) => n + (f.maintenance || 0), 0);
  const scope = filterName(towerFilter, categories);
  const [members, setMembers] = useState<MemberLite[]>([]);
  useEffect(() => {
    supabase.from("members").select("*").then(({ data }) => setMembers((data as MemberLite[]) || []));
  }, []);
  const fam = (f: (typeof flats)[number]) => familySummary(f, members);
  // Charges summary for the PDF heading, per category (e.g. "Tower A floors 1-9: 3BHK • 1500 sqft • ₹3,500")
  const shownIds = new Set(list.map((f) => f.id));
  const chargeLines = categories.filter((c) => c.ids.some((id) => shownIds.has(id)))
    .map((c) => `${c.terrace ? `Tower ${c.tower} floor ${c.floors} (terrace)` : `Tower ${c.tower} floors ${c.floors}`}: ${[c.bhk, c.sqft ? `${c.sqft} sqft` : "", c.maint != null ? `${rupees(c.maint)}/month` : ""].filter(Boolean).join(" • ")}`);

  function exportCSV() {
    const headers = ["Flat", "Tower", "Floor", "Owner Name", "Profession / Business", "Spouse", "Mobile", "Email", "Family Members", "BHK", "Sqft", "Maintenance", "Committee", "Status"];
    const rows = list.map((f) => { const x = fam(f); return [label(f), f.tower ?? "", floorOf(f), f.owner_name ?? "", x.profession, x.spouse?.name ?? "", x.mobile, f.email ?? "", x.count || "", f.bhk ?? "", f.sqft ?? "", f.maintenance ?? "", f.is_committee ? "Yes" : "", f.status ?? ""]; });
    const csv = "﻿" + [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Aakar_Society_Directory${towerFilter === "ALL" ? "" : `_${towerFilter}`}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to create the PDF."); return; }
    const html = `<html><head><title>Aakar Co-op - Directory</title><style>
      body{font-family:Inter,Arial,sans-serif;padding:24px;color:#1a1a18}
      .head{border-bottom:2px solid #0f1d3d;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
      h1{margin:0;color:#0f1d3d;font-size:22px;letter-spacing:.04em} .sub{font-size:11px;color:#7a7568;letter-spacing:.08em}
      .meta{font-size:11px;color:#444;margin:8px 0 14px} table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #e8e2d1;padding:5px 7px;text-align:left} th{background:#0f1d3d;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      tr:nth-child(even) td{background:#fdfcf5;-webkit-print-color-adjust:exact;print-color-adjust:exact} .gold{color:#b8932a}
      .charges{font-size:11px;border:1px solid #e8e2d1;background:#fdfcf5;padding:8px 10px;margin-bottom:12px;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      @page{size:A4 landscape;margin:12mm}
    </style></head><body>
      <div class="head"><div><h1>ॐ AAKAR CO-OP HOUSING SOCIETY LTD.</h1><div class="sub">${esc(SOCIETY.building)} • REG ${esc(SOCIETY.reg)} • ${esc(SOCIETY.address)}</div></div><div class="sub">DIRECTORY REPORT</div></div>
      <div class="meta">Date: ${esc(new Date().toLocaleDateString("en-IN"))} • ${esc(scope)} • Flats: ${list.length} • Owners recorded: ${withOwner} • Monthly maintenance: ${esc(rupees(monthly))} • By: ${esc(email)}</div>
      ${chargeLines.length ? `<div class="charges"><b>Flat types & monthly maintenance</b><br>${chargeLines.map(esc).join("<br>")}</div>` : ""}
      <table><tr><th>Flat</th><th>Owner</th><th>Profession / Business</th><th>Spouse</th><th>Mobile</th><th>Email</th></tr>
      ${list.map((f) => { const x = fam(f); return `<tr><td><b>${esc(label(f))}</b></td><td>${esc(f.owner_name)}${f.is_committee ? ' <span class="gold">★</span>' : ""}</td><td>${esc(x.profession)}</td><td>${esc(x.spouse?.name)}</td><td>${esc(x.mobile)}</td><td>${esc(f.email || x.head?.email)}</td></tr>`; }).join("")}
      </table></body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["FLATS", list.length], ["OCCUPIED", occupied], ["OWNERS RECORDED", withOwner], ["MONTHLY ₹", rupees(monthly)]].map(([k, v]) => (
          <div key={k as string} className="bg-[var(--surface)] border border-[var(--border)] p-4">
            <div className="mono text-[10px] opacity-60 tracking-[0.12em]">{k}</div>
            <div className="serif text-[26px] font-bold mt-1">{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="serif text-[22px] font-bold">Directory Reports</div>
        <div className="mono text-[11px] opacity-60 mt-1">Scope: {scope} • Click a tower or floor card in the sidebar to export only those flats</div>
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mono text-[11px] font-bold tracking-[0.12em]">CSV / EXCEL</div>
            <div className="mono text-[10px] opacity-60 mt-1">All columns with headings • opens in Excel</div>
            <button onClick={exportCSV} className="btn-navy mono text-[12px] tracking-[0.1em] w-full py-2.5 mt-4">DOWNLOAD CSV</button>
          </div>
          <div className="border border-[var(--border)] bg-[var(--bg)] p-5">
            <div className="mono text-[11px] font-bold tracking-[0.12em]">PDF REPORT</div>
            <div className="mono text-[10px] opacity-60 mt-1">Society letterhead + table • choose &quot;Save as PDF&quot; in the print window</div>
            <button onClick={exportPDF} className="btn-gold mono text-[12px] tracking-[0.1em] w-full py-2.5 mt-4">CREATE PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}
