"use client";
// Event registration by members: sessions (meals), counts, payment and passes. Rules live in EVENT_REGISTRATION.sql.
import QRCode from "qrcode";
import { supabase } from "./supabaseClient";
import { dmy, inr, today } from "./billing";
import { paged } from "./events";
import { label, ownerText, type Flat } from "./society";

export type Session = { id: string; name: string; date?: string | null; member_price: number | null; guest_price: number | null; ask_jain: boolean };
export type Count = { mr: number; mj: number; gr: number; gj: number };
export type Counts = Record<string, Count>;
export type PayStatus = "none" | "submitted" | "verified" | "rejected";
export type Reg = {
  id: string; event_id: string; flat_id: string; counts: Counts; amount: number; pay_status: PayStatus; pay_mode: "UPI" | "Cash" | null;
  pay_amount: number | null; pay_date: string | null; pay_ref: string | null; pay_bank: string | null; proof_key: string | null; cash_to: string | null;
  reject_reason: string | null; verified_by: string | null; verified_at: string | null; money_id: string | null; pass_code: string; created_at: string; updated_at: string | null;
};
export type RegSettings = { pass_sessions?: Session[] | null; reg_open?: boolean; reg_deadline?: string | null; reg_upi?: string | null; reg_prefill?: boolean };

export const ZERO: Count = { mr: 0, mj: 0, gr: 0, gj: 0 };
export const people = (c?: Count) => (c ? c.mr + c.mj + c.gr + c.gj : 0);
export const sessionsOf = (ev: RegSettings) => (Array.isArray(ev.pass_sessions) ? ev.pass_sessions : []);
export const newSessionId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Same sum the database makes (the database's figure is the one saved). */
export function amountFor(sessions: Session[], counts: Counts) {
  return sessions.reduce((n, s) => { const c = counts[s.id] || ZERO; return n + (c.mr + c.mj) * Number(s.member_price || 0) + (c.gr + c.gj) * Number(s.guest_price || 0); }, 0);
}
export const passReady = (r: Reg | null | undefined) => !!r && (Number(r.amount) === 0 || r.pay_status === "verified");
export const isOpen = (ev: RegSettings) => !!ev.reg_open && (!ev.reg_deadline || new Date(ev.reg_deadline).getTime() >= Date.now());
export const deadlineText = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "");
export const sessionWhen = (s: Session) => (s.date ? new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) : "");
export const priceText = (s: Session) => {
  const m = Number(s.member_price || 0);
  const g = s.guest_price == null ? "no guests" : `guest ₹${inr(s.guest_price)}`;
  return `${m ? `member ₹${inr(m)}` : "free for members"} • ${g}`;
};
/** "3 + 1 Jain • 2 guests" */
export function countText(c?: Count) {
  if (!c) return "—";
  const m = c.mr + c.mj, g = c.gr + c.gj, j = c.mj + c.gj;
  return [m ? `${m} member${m > 1 ? "s" : ""}` : "", g ? `${g} guest${g > 1 ? "s" : ""}` : "", j ? `${j} Jain` : ""].filter(Boolean).join(" • ");
}

const missing = (m: string) => /event_registrations|schema cache|does not exist/i.test(m);
/** null = not set up yet (run EVENT_REGISTRATION.sql) */
export async function loadRegs(eventId: string): Promise<Reg[] | null> {
  const { data, error } = await supabase.from("event_registrations").select("*").eq("event_id", eventId).order("created_at");
  if (error) return missing(error.message) ? null : [];
  return (data as Reg[]) || [];
}
export async function loadFlatRegs(flatId: string): Promise<Reg[]> {
  const { data, error } = await supabase.from("event_registrations").select("*").eq("flat_id", flatId);
  return error ? [] : (data as Reg[]) || [];
}
export async function peopleInFlat(flatId: string, keeper: boolean): Promise<number> {
  if (keeper) {
    const { data } = await supabase.rpc("flat_people_counts");
    const r = ((data as { flat_id: string; people: number }[]) || []).find((x) => x.flat_id === flatId);
    if (r) return r.people;
  }
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("flat_id", flatId);
  return count || 0;
}
const rpc = async (fn: string, args: Record<string, any>) => { const { data, error } = await supabase.rpc(fn, args); if (error) throw new Error(error.message); return data; };
export const saveSettings = (eventId: string, s: { sessions: Session[]; open: boolean; deadline: string | null; upi: string; prefill: boolean }) =>
  rpc("set_event_registration", { p_event: eventId, p_sessions: s.sessions, p_open: s.open, p_deadline: s.deadline, p_upi: s.upi, p_prefill: s.prefill });
export const register = (eventId: string, flat: string | null, counts: Counts) => rpc("register_for_event", { p_event: eventId, p_flat: flat, p_counts: counts }) as Promise<Reg | null>;
export const submitPayment = (regId: string, p: { mode: "UPI" | "Cash"; amount: number; date: string; ref?: string; bank?: string; proof?: string | null; cashTo?: string | null }) =>
  rpc("submit_event_payment", { p_reg: regId, p_mode: p.mode, p_amount: p.amount, p_date: p.date, p_ref: p.ref || null, p_bank: p.bank || null, p_proof: p.proof || null, p_cash_to: p.cashTo || null });
export const verifyPayment = (regId: string, ok: boolean, reason?: string) => rpc("verify_event_payment", { p_reg: regId, p_ok: ok, p_reason: reason || null });

// ---------- passes ----------
/** What the QR holds: registration, session and the pass's secret code (checked at the gate later). */
export const passCode = (r: Reg, s: Session) => `AKP1|${r.id}|${s.id}|${r.pass_code}`;
/** QR code as one SVG path (black squares), with its size in modules. */
export function qrPath(text: string): { size: number; d: string } {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size; let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
  return { size: n, d };
}

/** The pass as a picture (PNG file) for sharing on WhatsApp. Built from text, not read back from a blob. */
export function passImage(o: { event: string; session: string; when: string; flat: string; counts: string; code: string }): File {
  const W = 720, H = 1040, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0f1d3d"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#c9a227"; g.lineWidth = 8; g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = "#d4ae3c"; g.font = "700 22px Arial"; g.fillText("AAKAR CO-OP HOUSING SOCIETY • EVENT PASS", 48, 80);
  g.fillStyle = "#ffffff"; g.font = "800 46px Arial"; wrap(g, o.event, 48, 140, W - 96, 52);
  g.fillStyle = "#c9a227"; g.fillRect(48, 210, W - 96, 64);
  g.fillStyle = "#0f1d3d"; g.font = "800 32px Arial"; g.fillText(`${o.session}${o.when ? `  •  ${o.when}` : ""}`.slice(0, 40), 66, 254);
  const q = QRCode.create(o.code, { errorCorrectionLevel: "M" }); const n = q.modules.size, box = 420, cell = Math.floor(box / (n + 8)), size = cell * (n + 8), x0 = (W - size) / 2, y0 = 310;
  g.fillStyle = "#ffffff"; g.fillRect(x0, y0, size, size); g.fillStyle = "#000000";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) g.fillRect(x0 + (x + 4) * cell, y0 + (y + 4) * cell, cell, cell);
  g.fillStyle = "#ffffff"; g.font = "800 64px Arial"; g.textAlign = "center"; g.fillText(o.flat, W / 2, y0 + size + 90);
  g.font = "600 30px Arial"; g.fillStyle = "#f3dfa0"; g.fillText(o.counts, W / 2, y0 + size + 140);
  g.font = "400 22px Arial"; g.fillStyle = "rgba(255,255,255,.75)"; g.fillText("Show this pass at the counter. Family members may share it.", W / 2, H - 56);
  const url = c.toDataURL("image/png"); const bin = atob(url.slice(url.indexOf(",") + 1)); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], `pass-${o.flat}-${o.session}.png`.replace(/[^\w.-]+/g, "-"), { type: "image/png" });
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(/\s+/); let line = "", lines = 0;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > max && line) { g.fillText(line, x, y + lines * lh); line = w; lines++; if (lines > 1) return; } else line = t; }
  g.fillText(line, x, y + lines * lh);
}

// ---------- gate scanning (EVENT_CHECKINS.sql) ----------
export type Checkin = { id: string; event_id: string; reg_id: string; flat_id: string; session_id: string; people: number; scanned_by: string | null; created_at: string };
export type GateResult = { reg_id: string; flat_id: string; session_id: string; session: string; allowed: number; used: number; left: number; paid: boolean; last_at: string | null; entered: number };
/** null = gate scanning not set up yet (run EVENT_CHECKINS.sql) */
export async function loadCheckins(eventId: string): Promise<Checkin[] | null> {
  const { data, error } = await supabase.from("event_checkins").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
  if (error) return /event_checkins|schema cache|does not exist/i.test(error.message) ? null : [];
  return (data as Checkin[]) || [];
}
/** Look at a pass (people omitted) or let people in. Errors come back as readable messages from the database. */
export const gatePass = (code: string, people?: number) => rpc("gate_pass", { p_code: code, p_people: people ?? null }) as Promise<GateResult>;
export const gateUndo = (id: string) => rpc("gate_undo", { p_id: id });
/** How many have come in: per session, and per registration + session. */
export function attended(checkins: Checkin[] | null | undefined) {
  const bySession: Record<string, number> = {}, byReg: Record<string, number> = {};
  (checkins || []).forEach((k) => { bySession[k.session_id] = (bySession[k.session_id] || 0) + k.people; byReg[`${k.reg_id}|${k.session_id}`] = (byReg[`${k.reg_id}|${k.session_id}`] || 0) + k.people; });
  return { bySession, byReg };
}

// ---------- printout for the caterer / team ----------
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function sessionTotals(sessions: Session[], regs: Reg[]) {
  return sessions.map((s) => {
    const t = { ...ZERO }; let flats = 0;
    regs.forEach((r) => { const c = r.counts?.[s.id]; if (c && people(c)) { flats++; t.mr += c.mr; t.mj += c.mj; t.gr += c.gr; t.gj += c.gj; } });
    return { s, t, flats };
  });
}
export function countsPages(title: string, sessions: Session[], regs: Reg[], flats: Flat[], checkins?: Checkin[] | null): string[] {
  const tot = sessionTotals(sessions, regs);
  const scanned = !!checkins?.length;   // ATTENDED shows once the gate has started scanning
  const att = attended(checkins);
  const cell = (t: string, r = false, b = false) => `<td style="padding:1.6mm 2mm;border-bottom:.25mm solid var(--line);${r ? "text-align:right;" : ""}${b ? "font-weight:800;" : ""}">${t}</td>`;
  const head = (cols: string[]) => `<tr style="background:var(--navy);color:#fff">${cols.map((c, i) => `<th style="padding:1.6mm 2mm;text-align:${i ? "right" : "left"};font-size:8pt">${c}</th>`).join("")}</tr>`;
  const summary = `<table style="width:100%;border-collapse:collapse;font-size:10.5pt;margin-top:5mm">${head(["MEAL / SESSION", "REGULAR", "JAIN", "TOTAL", ...(scanned ? ["ATTENDED"] : [])])}
    ${tot.map(({ s, t }) => `<tr>${cell(`<b>${esc(s.name)}</b>${s.date ? ` • ${esc(sessionWhen(s))}` : ""}<div style="font-size:8pt;color:var(--mute)">members ${t.mr + t.mj} • guests ${t.gr + t.gj}</div>`)}${cell(String(t.mr + t.gr), true)}${cell(String(t.mj + t.gj), true)}${cell(String(people(t)), true, true)}${scanned ? cell(String(att.bySession[s.id] || 0), true, true) : ""}</tr>`).join("")}</table>`;
  const rows = [...regs].sort((a, b) => a.flat_id.localeCompare(b.flat_id)).map((r) => {
    const f = flats.find((x) => x.id === r.flat_id);
    return `<tr>${cell(`<b>${esc(f ? label(f) : r.flat_id)}</b> <span style="color:var(--mute)">${esc(f ? ownerText(f) : "")}</span>`)}${sessions.map((s) => cell(people(r.counts?.[s.id]) ? `${people(r.counts[s.id])}${r.counts[s.id].mj + r.counts[s.id].gj ? ` (${r.counts[s.id].mj + r.counts[s.id].gj} J)` : ""}${scanned ? `<div style="font-size:8pt;color:var(--mute)">came ${att.byReg[`${r.id}|${s.id}`] || 0}</div>` : ""}` : "—", true)).join("")}${cell(passReady(r) ? "Paid" : r.pay_status === "submitted" ? "To check" : "Unpaid", true)}</tr>`;
  });
  const ths = ["FLAT", ...sessions.map((s) => esc(s.name.toUpperCase())), "PAYMENT"].map((c, i) => `<th style="padding:1.6mm 2mm;text-align:${i ? "right" : "left"};font-size:8pt">${c}</th>`).join("");
  const top = `<div style="margin-top:5mm;font-size:13pt;font-weight:800;color:var(--navy)">${esc(title)}</div><div style="font-size:9.5pt;color:var(--mute)">${regs.length} flats registered${scanned ? " • ATTENDED = people let in at the gate (scanned passes)" : ""}</div>${summary}
    <div style="margin-top:6mm;font-size:9pt;font-weight:800;letter-spacing:.14em;color:var(--gold)">FLAT-WISE (J = Jain)</div>`;
  const firstCap = Math.max(8, 30 - tot.length * 2);
  return paged("EVENT", "COUNTS", `Printed <b>${dmy(today())}</b>`, top, ths, rows, firstCap, 40, `${title} • registrations`, "", `<tr><td style="padding:2mm">No registrations yet.</td></tr>`);
}
