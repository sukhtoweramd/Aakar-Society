"use client";
// REPORTS → Vehicle directory: flat, resident, contact and one line per vehicle.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { familySummary, label, residentName, sortFlats, SOCIETY, type Flat, type MemberLite } from "@/lib/society";
import { VEHICLE_TYPES } from "./FlatListPanel";
import { backButton } from "@/lib/printBack";

type Vehicle = { id: string; flat_id: string; vtype: string; model: string | null; plate: string | null };
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function VehicleReport({ list, members, scope }: { list: Flat[]; members: MemberLite[]; scope: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [vtype, setVtype] = useState("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("vehicles").select("*").then(({ data, error }) => {
      if (error) setMissing(true);
      setVehicles((data as Vehicle[]) || []);
    });
  }, []);

  const groups = useMemo(() => {
    const s = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return [...list].sort(sortFlats).map((f) => {
      const x = familySummary(f, members);
      const vs = (vehicles || []).filter((v) => v.flat_id === f.id && (vtype === "ALL" || v.vtype === vtype)
        && (!s || (v.plate || "").replace(/\s/g, "").includes(s)));
      return { f, resident: residentName(f) || "—", tenant: f.occupancy === "tenant", mobile: x.head?.mobile || x.mobile || "", vs };
    }).filter((g) => g.vs.length > 0);
  }, [list, members, vehicles, vtype, q]);
  const total = groups.reduce((n, g) => n + g.vs.length, 0);
  const byType = VEHICLE_TYPES.map((t) => [t, groups.reduce((n, g) => n + g.vs.filter((v) => v.vtype === t).length, 0)] as const).filter(([, n]) => n > 0);
  const scopeText = `${scope}${vtype !== "ALL" ? ` • ${vtype}` : ""}${q ? ` • plate "${q.toUpperCase()}"` : ""}`;

  function csv() {
    const rows = [["Flat", "Tower", "Resident", "Owner/Tenant", "Contact", "Vehicle type", "Model", "Number plate"]];
    groups.forEach((g) => g.vs.forEach((v) => rows.push([label(g.f), g.f.tower || "", g.resident, g.tenant ? "Tenant" : "Owner", g.mobile, v.vtype, v.model || "", v.plate || ""])));
    const text = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "Aakar_Vehicle_Directory.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pdf() {
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to create the PDF."); return; }
    const today = new Date().toLocaleDateString("en-IN");
    const towers = Array.from(new Set(groups.map((g) => g.f.tower || "?")));
    const sections = towers.map((t, i) => {
      const body = groups.filter((g) => (g.f.tower || "?") === t).map((g) => `<tbody class="grp">${g.vs.map((v, k) => `<tr class="${k === 0 ? "first" : ""}">
          <td>${k === 0 ? `<b>${esc(label(g.f))}</b>` : ""}</td>
          <td>${k === 0 ? `${esc(g.resident)}${g.tenant ? ' <span class="muted">(tenant)</span>' : ""}` : ""}</td>
          <td>${k === 0 ? esc(g.mobile) : ""}</td>
          <td>${esc(v.vtype)}</td><td>${esc(v.model)}</td><td>${v.plate ? `<span class="plate">${esc(v.plate)}</span>` : "—"}</td></tr>`).join("")}</tbody>`).join("");
      return `<table class="${i ? "newpage" : ""}"><thead>
        <tr class="title"><td colspan="6"><div class="row"><div><h1>ॐ AAKAR CO-OP HOUSING SOCIETY LTD. — VEHICLE DIRECTORY</h1>
          <div class="sub">${esc(SOCIETY.building)} • REG ${esc(SOCIETY.reg)} • ${esc(today)} • ${esc(scopeText)}</div></div><div class="tower">TOWER ${esc(t)}</div></div></td></tr>
        <tr class="gap"><td colspan="6"></td></tr>
        <tr><th style="width:8%">Flat</th><th style="width:24%">Resident</th><th style="width:14%">Contact</th><th style="width:15%">Type</th><th style="width:16%">Model</th><th>Number</th></tr>
      </thead>${body}</table>`;
    }).join("");
    const totals = `<div class="totals"><b>Total vehicles: ${total}</b> &nbsp;•&nbsp; ${byType.map(([t, n]) => `${esc(t)}: ${n}`).join(" &nbsp;•&nbsp; ")}</div>`;
    w.document.write(`<html><head><title>Aakar Co-op - Vehicle Directory ${esc(today)}</title><style>
      @page{size:A4 portrait;margin:12mm 10mm 15mm;
        @bottom-left{content:"Aakar Co-op • Vehicle Directory • ${esc(today)} • For society use only";font:8px Inter,Arial,sans-serif;color:#7a7568}
        @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Inter,Arial,sans-serif;color:#7a7568}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;margin:0;color:#1a1a18}
      table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed} thead{display:table-header-group}
      td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 6px;border-bottom:1px dotted #e8e2d1}
      tbody.grp{break-inside:avoid} tr.first td{border-top:1px solid #d9d1bb} tbody.grp tr:first-child td{background:#f7f2e4}
      table.newpage{break-before:page}
      .title td{border:0;border-bottom:2px solid #0f1d3d;padding:0 0 7px;white-space:normal}
      .row{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-right:3px}
      h1{margin:0;color:#0f1d3d;font-size:14.5px} .sub{font-size:9.5px;color:#7a7568;margin-top:2px}
      .tower{font-size:13px;font-weight:700;color:#0f1d3d;border:1.5px solid #0f1d3d;padding:3px 10px;white-space:nowrap}
      th{background:#0f1d3d;color:#fff;text-align:left;padding:5px 6px} .gap td{border:0;height:6px;padding:0}
      .plate{font-family:"DejaVu Sans Mono",Consolas,monospace;font-weight:700;border:1px solid #0f1d3d;padding:0 4px;letter-spacing:.04em}
      .muted{color:#7a7568} .totals{margin-top:12px;border:1px solid #e8e2d1;background:#fdfcf5;padding:8px 10px;font-size:11px;break-inside:avoid}
      .bar{position:sticky;top:0;z-index:5;background:#0f1d3d;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:13px;margin:-24px -24px 18px}
      .bar button{background:#c9a227;color:#000;border:0;padding:8px 16px;font-weight:700;cursor:pointer}
      @media screen{body{padding:24px;max-width:794px;margin:auto} table{margin-bottom:24px}} @media print{.bar{display:none}}
    </style></head><body>
      <div class="bar">${backButton()}<button onclick="window.print()">PRINT / SAVE AS PDF</button><span>${total} vehicle${total === 1 ? "" : "s"} in ${groups.length} flat${groups.length === 1 ? "" : "s"}</span></div>
      ${sections || "<p>No vehicles match.</p>"}${totals}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--bg)] p-5 sm:col-span-2">
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div>
          <div className="mono text-[11px] font-bold tracking-[0.12em]">VEHICLE DIRECTORY</div>
          <div className="mono text-[10px] opacity-60 mt-1">Flat, resident, contact and each vehicle on its own line • {missing ? "needs the one-time database step" : `${total} vehicle${total === 1 ? "" : "s"} in ${groups.length} flat${groups.length === 1 ? "" : "s"}`}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="field !w-auto !py-1.5 mono text-[11px]" value={vtype} onChange={(e) => setVtype(e.target.value)}>
            <option value="ALL">All vehicle types</option>{VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="field !w-[170px] !py-1.5 mono text-[11px] uppercase" placeholder="Search number plate" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {q.trim() && (
        <div className="mt-3 space-y-1 mono text-[11px]">
          {groups.slice(0, 8).map((g) => g.vs.map((v) => (
            <div key={v.id} className="border border-[var(--border)] bg-white p-2 flex flex-wrap gap-x-3">
              <b>{v.plate}</b><span>{v.vtype} • {v.model}</span><span className="opacity-70">{label(g.f)} • {g.resident} • {g.mobile}</span>
            </div>
          )))}
          {groups.length === 0 && <div className="opacity-60">No vehicle with that number.</div>}
        </div>
      )}
      {byType.length > 0 && <div className="mono text-[10px] mt-3 opacity-70">{byType.map(([t, n]) => `${t}: ${n}`).join(" • ")}</div>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={csv} disabled={!total} className="btn-navy mono text-[12px] tracking-[0.1em] py-2.5">DOWNLOAD CSV</button>
        <button onClick={pdf} disabled={!total} className="btn-gold mono text-[12px] tracking-[0.1em] py-2.5">CREATE PDF</button>
      </div>
    </div>
  );
}
