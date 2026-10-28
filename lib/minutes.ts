"use client";
// Minutes of meetings (AGM / SGM / committee) and their action items.
import { supabase } from "./supabaseClient";
import { dmy, docPage, today } from "./billing";
import { committeeName, label, ownerText, type Flat } from "./society";

export type Meeting = {
  id: string; kind: "AGM" | "SGM" | "Committee" | "Event"; event_id?: string | null; event_title?: string | null; meeting_date: string; venue: string | null; chaired_by: string | null;
  attendees: string | null; agenda: string | null; minutes: string | null; file_url: string | null; status: "draft" | "final";
  created_by: string | null; created_at: string; updated_at: string | null;
};
export type Action = { id: string; meeting_id: string; task: string; owner_flat: string | null; due_date: string | null; status: "open" | "done"; done_note: string | null; done_at: string | null; done_by: string | null };

export const KIND_LABEL: Record<Meeting["kind"], string> = { AGM: "Annual General Meeting", SGM: "Special General Meeting", Committee: "Committee Meeting", Event: "Event Committee Meeting" };
/** "Navratri 2026 – Organising Committee Meeting" for events, else the plain kind */
export const meetingName = (m: Pick<Meeting, "kind" | "event_title">, title?: string | null) => (m.kind === "Event" ? `${title || m.event_title || "Event"} – Organising Committee Meeting` : KIND_LABEL[m.kind]);

const missing = (m: string) => /meetings|meeting_actions|schema cache|does not exist/i.test(m);
/** null = not set up yet (run MINUTES.sql) */
export async function loadMeetings(): Promise<{ meetings: Meeting[]; actions: Action[] } | null> {
  const [m, a] = await Promise.all([supabase.from("meetings").select("*").order("meeting_date", { ascending: false }), supabase.from("meeting_actions").select("*").order("due_date", { ascending: true })]);
  if (m.error) return missing(m.error.message) ? null : { meetings: [], actions: [] };
  return { meetings: (m.data as Meeting[]) || [], actions: a.error ? [] : (a.data as Action[]) || [] };
}

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const lines = (s: string | null) => (s || "").split(/\n/).map((x) => x.trim()).filter(Boolean);
export const isOverdue = (a: Action) => a.status === "open" && !!a.due_date && a.due_date < today();

export function minutesHtml(m: Meeting, actions: Action[], flats: Flat[], eventTitle?: string | null): string {
  const name = meetingName(m, eventTitle);
  const ev = m.kind === "Event";
  const who = (id: string | null) => { const f = flats.find((x) => x.id === id); return f ? `${f.is_committee ? committeeName(f) : ownerText(f)}${f.committee_role ? ` (${f.committee_role})` : ""}` : "—"; };
  const H = (t: string) => `<div style="margin-top:5mm;font-size:9pt;font-weight:800;letter-spacing:.14em;color:var(--gold)">${t}</div>`;
  const agenda = lines(m.agenda);
  const att = lines(m.attendees);
  const paras = (m.minutes || "").trim().split(/\n\s*\n/).filter(Boolean).map((p) => `<p style="margin:0 0 3mm">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const acts = actions.filter((a) => a.meeting_id === m.id);
  const inner = `
  <div style="margin-top:5mm;display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm;font-size:10pt;color:#2a2822">
    <div${ev ? ' style="grid-column:1/-1"' : ""}>Meeting: <b style="color:var(--navy)">${esc(name)}</b></div><div>Date: <b style="color:var(--navy)">${esc(dmy(m.meeting_date, true))}</b></div>
    <div>Venue: <b>${esc(m.venue || "—")}</b></div><div>Chaired by: <b>${esc(m.chaired_by || "—")}</b></div>
  </div>
  ${att.length ? `${H("PRESENT")}<div style="font-size:10pt;line-height:1.5;margin-top:1.5mm">${att.map(esc).join(", ")}</div>` : ""}
  ${agenda.length ? `${H("AGENDA")}<ol style="font-size:10.5pt;line-height:1.55;margin:1.5mm 0 0 6mm;padding:0">${agenda.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>` : ""}
  ${paras ? `${H("PROCEEDINGS AND DECISIONS")}<div style="font-size:10.5pt;line-height:1.65;margin-top:1.5mm;text-align:justify">${paras}</div>` : ""}
  ${acts.length ? `${H("ACTION POINTS")}<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:1.5mm">
    <tr style="background:var(--navy);color:#fff"><th style="text-align:left;padding:1.5mm 2mm">#</th><th style="text-align:left;padding:1.5mm 2mm">Action</th><th style="text-align:left;padding:1.5mm 2mm">Responsible</th><th style="text-align:left;padding:1.5mm 2mm">By</th><th style="text-align:left;padding:1.5mm 2mm">Status</th></tr>
    ${acts.map((a, i) => `<tr style="border-bottom:.25mm solid var(--line)"><td style="padding:1.5mm 2mm">${i + 1}</td><td style="padding:1.5mm 2mm">${esc(a.task)}</td><td style="padding:1.5mm 2mm">${esc(who(a.owner_flat))}</td><td style="padding:1.5mm 2mm;white-space:nowrap">${a.due_date ? esc(dmy(a.due_date)) : "—"}</td><td style="padding:1.5mm 2mm">${a.status === "done" ? "Done" : "Open"}</td></tr>`).join("")}</table>` : ""}
  ${m.status === "draft" ? `<div class="void" style="color:rgba(180,35,24,.18)">DRAFT</div>` : ""}
  <div style="margin-top:12mm;display:flex;justify-content:space-between;font-size:10pt">
    <div style="border-top:.3mm solid var(--ink);padding-top:1mm;min-width:60mm;text-align:center">${ev ? "Convenor" : "Chairman"}</div>
    <div style="border-top:.3mm solid var(--ink);padding-top:1mm;min-width:60mm;text-align:center">${ev ? "Treasurer" : "Hon. Secretary"}</div>
  </div>`;
  return docPage("MINUTES", m.kind === "Committee" ? "COMMITTEE" : ev ? "EVENT" : m.kind, `Date <b>${esc(dmy(m.meeting_date))}</b>`, inner,
    `Minutes of the ${name} • ${m.status === "final" ? "final" : "draft"}`, `Printed ${dmy(today())}`);
}
export const flatName = (flats: Flat[], id: string | null) => { const f = flats.find((x) => x.id === id); return f ? `${ownerText(f)} (${label(f)})` : ""; };
