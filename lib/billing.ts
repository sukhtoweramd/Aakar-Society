"use client";
// Billing: shared types, numbering, amounts, ledger maths and the printable bill / receipt / statement.
import { supabase } from "./supabaseClient";
import { label, SOCIETY, type Flat } from "./society";
import { backButton } from "./printBack";

export type Settings = {
  id: number; bill_prefix: string; bill_last_no: number; other_prefix: string; other_last_no: number;
  rcpt_prefix: string; rcpt_last_no: number; num_digits: number; due_days: number;
  account_name: string | null; bank_name: string | null; bank_branch: string | null; account_no: string | null;
  ifsc: string | null; upi_id: string | null; cheque_payee: string | null; pay_note: string | null;
  bill_signer: string | null; rcpt_signer: string | null; stamp_image: string | null;
  letter_prefix?: string; letter_last_no?: number; // after LETTERS.sql
};
export type Signatory = { id: string; name: string; designation: string; signature_image: string | null; active: boolean };
export type Line = { description: string; rate?: number | null; qty?: number | null; amount: number };
export type Bill = {
  id: string; bill_no: string; flat_id: string; kind: "maintenance" | "other"; bill_to: string | null;
  bill_date: string; due_date: string | null; period_from: string | null; period_to: string | null;
  lines: Line[]; amount: number; signer_id: string | null; signer_name: string | null; signer_designation: string | null;
  status: "active" | "cancelled"; cancel_reason: string | null; created_at: string; created_by: string | null;
};
export type Payment = {
  id: string; receipt_no: string; bill_id: string; flat_id: string; amount: number; paid_on: string;
  mode: string; bank: string | null; ref: string | null; received_from: string | null;
  signer_id: string | null; signer_name: string | null; signer_designation: string | null;
  status: "active" | "cancelled"; cancel_reason: string | null; created_at: string; created_by: string | null;
};
export const MODES = ["Cheque", "NEFT", "IMPS", "UPI", "Cash", "Other"];
export const OTHER_PRESETS = ["Lift usage", "Common plot / hall booking", "Damage repair", "Opening balance (arrears)", "Other"];

// ---------- small helpers ----------
export const num = (n: any) => Number(n || 0);
export const inr = (n: any, dec = false) => num(n).toLocaleString("en-IN", dec ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
export const dmy = (s?: string | null, long = false) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "2-digit", month: long ? "long" : "short", year: "numeric" }) : "");
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const docNo = (prefix: string, n: number, digits: number) => `${prefix}${String(n).padStart(digits, "0")}`;
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Half-year periods: "2026-H1" = 1 Apr 2026 – 30 Sep 2026, "2026-H2" = 1 Oct 2026 – 31 Mar 2027. */
export function periodOf(key: string) {
  const [y, h] = key.split("-H").map(Number);
  return h === 1
    ? { from: `${y}-04-01`, to: `${y}-09-30`, billDate: `${y}-04-01`, label: `Apr–Sep ${y}`, long: `01 April ${y} to 30 September ${y}` }
    : { from: `${y}-10-01`, to: `${y + 1}-03-31`, billDate: `${y}-10-01`, label: `Oct ${y} – Mar ${y + 1}`, long: `01 October ${y} to 31 March ${y + 1}` };
}
export function periodOptions(): string[] {
  const d = new Date(); const y = d.getFullYear(); const out: string[] = [];
  for (let yy = y - 1; yy <= y + 1; yy++) out.push(`${yy}-H1`, `${yy}-H2`);
  return out;
}
export function currentPeriodKey() { const d = new Date(); const m = d.getMonth() + 1; return m >= 4 && m <= 9 ? `${d.getFullYear()}-H1` : m >= 10 ? `${d.getFullYear()}-H2` : `${d.getFullYear() - 1}-H2`; }
export const monthsIn = (from: string, to: string) => { const a = new Date(from), b = new Date(to); return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1; };

/** Indian-style amount in words: 21000 -> "Rupees Twenty-One Thousand Only" */
export function inWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : ""));
  const three = (n: number) => [Math.floor(n / 100) ? ones[Math.floor(n / 100)] + " Hundred" : "", n % 100 ? two(n % 100) : ""].filter(Boolean).join(" ");
  let r = Math.floor(amount); const p = Math.round((amount - r) * 100);
  if (r === 0 && p === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const cr = Math.floor(r / 10000000); r %= 10000000;
  const la = Math.floor(r / 100000); r %= 100000;
  const th = Math.floor(r / 1000); r %= 1000;
  if (cr) parts.push(three(cr) + " Crore"); if (la) parts.push(two(la) + " Lakh"); if (th) parts.push(two(th) + " Thousand"); if (r) parts.push(three(r));
  return `Rupees ${parts.join(" ") || "Zero"}${p ? ` and ${two(p)} Paise` : ""} Only`;
}

// ---------- data ----------
export async function loadSettings(): Promise<Settings | null> {
  const { data } = await supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle();
  return (data as Settings) || null;
}
export async function loadSignatories(): Promise<Signatory[]> {
  const { data } = await supabase.from("signatories").select("*").order("created_at");
  return (data as Signatory[]) || [];
}
export async function reserveNumbers(series: "bill" | "other" | "receipt" | "letter", count: number) {
  const { data, error } = await supabase.rpc("next_doc_numbers", { p_series: series, p_count: count });
  if (error) throw error;
  const r = (data as any[])[0];
  return Array.from({ length: count }, (_, i) => docNo(r.prefix, r.first_no + i, r.digits));
}
export function billBalance(b: Bill, pays: Payment[]) {
  const paid = pays.filter((p) => p.bill_id === b.id && p.status === "active").reduce((n, p) => n + num(p.amount), 0);
  return { paid, balance: b.status === "cancelled" ? 0 : Math.round((num(b.amount) - paid) * 100) / 100 };
}
export function flatTotals(bills: Bill[], pays: Payment[]) {
  const live = bills.filter((b) => b.status === "active");
  const billed = live.reduce((n, b) => n + num(b.amount), 0);
  const received = pays.filter((p) => p.status === "active" && live.some((b) => b.id === p.bill_id)).reduce((n, p) => n + num(p.amount), 0);
  return { billed, received, due: Math.round((billed - received) * 100) / 100 };
}

// ---------- signatures & stamp ----------
/** Make a photo of a signature/stamp on white paper into a cropped transparent PNG (data URL). */
export function cleanImage(file: File, maxW = 700): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d")!; x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h); const px = d.data;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        // light paper -> transparent; ink keeps its colour with a soft edge
        const a = lum > 200 ? 0 : lum < 140 ? 255 : Math.round(((200 - lum) / 60) * 255);
        px[i + 3] = Math.min(px[i + 3], a);
        if (a > 40) { const p = i / 4, X = p % w, Y = (p - X) / w; if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; }
      }
      x.putImageData(d, 0, 0); URL.revokeObjectURL(url);
      if (maxX <= minX || maxY <= minY) { reject(new Error("Could not find the signature/stamp in the photo. Use dark ink on plain white paper.")); return; }
      const pad = 8; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
      const cw = maxX - minX + 1, ch = maxY - minY + 1, s2 = Math.min(1, maxW / cw);
      const o = document.createElement("canvas"); o.width = Math.round(cw * s2); o.height = Math.round(ch * s2);
      o.getContext("2d")!.drawImage(c, minX, minY, cw, ch, 0, 0, o.width, o.height);
      resolve(o.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Could not read the image. Use JPG or PNG."));
    img.src = url;
  });
}

/** Built-in round blue society stamp (used until a real stamp photo is uploaded). */
export const DEFAULT_STAMP = (() => {
  const c = "#1f3a93";
  const a = (r: number, d: number) => { const t = (d * Math.PI) / 180; return `${(300 + r * Math.cos(t)).toFixed(1)},${(300 + r * Math.sin(t)).toFixed(1)}`; };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><path id="t" d="M ${a(218, 148)} A 218,218 0 1,1 ${a(218, 32)}"/><path id="b" d="M 52,300 A 248,248 0 0,0 548,300"/></defs>
  <g fill="none" stroke="${c}"><circle cx="300" cy="300" r="286" stroke-width="12"/><circle cx="300" cy="300" r="268" stroke-width="3"/><circle cx="300" cy="300" r="166" stroke-width="5"/></g>
  <g font-family="Inter,Arial,sans-serif" font-weight="800" fill="${c}"><text font-size="44" letter-spacing="4"><textPath href="#t" startOffset="50%" text-anchor="middle">AAKAR CO-OP HOUSING SOC. LTD.</textPath></text>
  <text font-size="34" letter-spacing="6"><textPath href="#b" startOffset="50%" text-anchor="middle">★  AHMEDABAD  ★</textPath></text></g>
  <g fill="${c}" text-anchor="middle" font-family="Inter,Arial,sans-serif"><text x="300" y="268" font-size="26" font-weight="700" letter-spacing="6">REG. NO.</text>
  <text x="300" y="328" font-size="58" font-weight="800" letter-spacing="2">G-16551</text><line x1="200" y1="350" x2="400" y2="350" stroke="${c}" stroke-width="3"/>
  <text x="300" y="392" font-size="30" font-weight="700" letter-spacing="6">EST. 1994</text></g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

// ---------- printing ----------
const CSS = `@page{size:A4 portrait;margin:0}
:root{--navy:#0f1d3d;--gold:#b8932a;--cream:#fbf7ec;--line:#e2d9c0;--ink:#1a1a18;--mute:#6f6a5d}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{background:#e9e6dc;font-family:Inter,"Segoe UI","Noto Sans Gujarati","Nirmala UI",Shruti,Arial,sans-serif;color:var(--ink)}
.page{position:relative;width:210mm;height:297mm;padding:9mm;background:#fff;break-after:page;overflow:hidden}.page:last-child{break-after:auto}
.frame{height:100%;border:2.2mm solid var(--navy);padding:1.6mm;position:relative}
.inner{height:100%;border:.5mm solid var(--gold);padding:6mm 8mm 5mm;position:relative;display:flex;flex-direction:column;background:radial-gradient(circle at 100% 0,rgba(184,147,42,.07),transparent 40%),#fff;isolation:isolate}
.wm{position:absolute;left:50%;top:54%;width:158mm;max-height:205mm;object-fit:contain;transform:translate(-50%,-50%);z-index:-1;pointer-events:none}.nobg .wm{display:none}
.corner{position:absolute;width:2.6mm;height:2.6mm;background:var(--gold);transform:rotate(45deg)}.c1{left:-1.55mm;top:-1.55mm}.c2{right:-1.55mm;top:-1.55mm}.c3{left:-1.55mm;bottom:-1.55mm}.c4{right:-1.55mm;bottom:-1.55mm}
.head{display:flex;align-items:center;gap:5mm;padding-bottom:3mm;border-bottom:.6mm solid var(--navy)}
.seal{width:17mm;height:17mm;border-radius:50%;border:.6mm solid var(--gold);display:grid;place-items:center;font-size:24pt;color:var(--gold);background:var(--navy);flex:none}
.soc{flex:1;min-width:0}.soc h1{font-weight:800;font-size:12.5pt;line-height:1.2;letter-spacing:.01em;color:var(--navy)}.soc .a{font-size:8.2pt;color:var(--mute);margin-top:1mm}
.title{text-align:right;flex-shrink:0;max-width:72mm;margin-left:2mm}.title .t{font-size:8pt;letter-spacing:.2em;color:var(--gold);font-weight:700}.title .f{font-weight:800;font-size:18pt;color:var(--navy);line-height:1.25;white-space:nowrap}.title .f.long{font-size:14.5pt}.title .s{font-size:8pt;color:var(--mute);white-space:nowrap;margin-top:.8mm}.title .s b{color:var(--navy)}
.meta{display:grid;grid-template-columns:1.3fr 1fr;gap:3.5mm;margin-top:4mm}
.box{border:.3mm solid var(--line);padding:2.4mm 3.5mm;background:rgba(255,255,255,.72)}.box .lbl{font-size:6.6pt;letter-spacing:.16em;color:var(--gold);font-weight:700}
.box .nm{font-size:13pt;font-weight:700;color:var(--navy);margin-top:.6mm}.box .ln{font-size:8.6pt;color:#3a372f;margin-top:.8mm;line-height:1.45}
.kv{display:grid;grid-template-columns:auto 1fr;gap:1mm 4mm;font-size:8.8pt;margin-top:1.4mm}.kv span{color:var(--mute)}.kv b{color:var(--navy)}
table{width:100%;border-collapse:collapse;font-size:9pt;margin-top:4mm}
th{background:var(--navy);color:#fff;text-align:left;font-weight:600;font-size:7.4pt;letter-spacing:.06em;padding:2mm 2.6mm}
td{padding:2.3mm 2.6mm;border-bottom:.25mm solid var(--line);vertical-align:top}tr:nth-child(even) td{background:rgba(251,247,236,.78)}
.r{text-align:right;white-space:nowrap}td.n{font-weight:600;color:var(--navy)}td .sub{display:block;font-size:7.6pt;color:var(--mute);margin-top:.3mm;font-weight:400}
tr.tot td{background:var(--navy)!important;color:#fff;font-weight:800;font-size:11pt;border:0}tr.mid td{background:#fff!important}
.words{margin-top:2mm;font-size:8.6pt;color:#3a372f}.words b{color:var(--navy)}
.pay{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm;margin-top:4mm}
.note{font-size:8pt;color:#3a372f;line-height:1.5;margin-top:3mm;border-left:.8mm solid var(--gold);padding-left:3mm}
.recv{margin-top:5mm;border:.3mm solid var(--line);background:var(--cream);padding:5mm 6mm;font-size:10.5pt;line-height:1.75;color:#2a2822}.recv b{color:var(--navy)}.recv .amt{font-size:13pt;font-weight:800;color:var(--navy)}
.sec{margin-top:4mm}.sh{display:flex;align-items:center;gap:2.5mm}.sh span{font-size:8pt;font-weight:800;letter-spacing:.2em;color:var(--navy)}.sh i{flex:1;height:.3mm;background:linear-gradient(90deg,var(--gold),transparent)}
.sign{display:flex;justify-content:flex-end;align-items:flex-end;gap:6mm;margin-top:5mm}
.stamp{width:30mm;height:30mm;object-fit:contain;transform:rotate(-8deg);opacity:.9}
.sig{text-align:center;min-width:60mm}.sig .for{font-size:8.6pt;color:var(--navy);font-weight:700;text-align:right}
.sig img{height:15mm;max-width:58mm;object-fit:contain;display:block;margin:2mm auto 0}.sig .blank{height:15mm}
.sig .l{border-top:.3mm solid var(--ink);padding-top:1mm;font-size:8.4pt;margin-top:1mm}.sig .l b{display:block;font-size:8.6pt}
.paid{position:absolute;left:24mm;bottom:58mm;border:1.2mm solid #1f8a4c;color:#1f8a4c;font-weight:800;font-size:22pt;letter-spacing:.14em;padding:2mm 5mm;transform:rotate(-10deg);text-align:center;line-height:1.15}
.paid small{display:block;font-size:7.5pt;letter-spacing:.12em}.paid.part{border-color:#b26a00;color:#b26a00}.void{position:absolute;inset:0;display:grid;place-items:center;font-size:70pt;font-weight:900;color:rgba(180,35,24,.16);transform:rotate(-30deg);pointer-events:none;letter-spacing:.1em}
.slip{margin-top:auto;border-top:.5mm dashed var(--mute);padding-top:3.5mm;position:relative}.slip .cut{position:absolute;top:-2.6mm;left:0;font-size:9pt;color:var(--mute);background:#fff;padding-right:2mm}
.slip h3{font-size:8pt;letter-spacing:.2em;color:var(--navy);font-weight:800}.fill{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 5mm;margin-top:3mm;font-size:8.4pt}.fill div{border-bottom:.3mm solid var(--line);padding-bottom:1.2mm;color:var(--mute)}.fill b{color:var(--navy)}
.foot{margin-top:3mm;padding-top:2.5mm;border-top:.3mm solid var(--line);display:flex;justify-content:space-between;align-items:flex-end;font-size:7.2pt;color:var(--mute);flex:none}
.grow{flex:1}
.bar{position:sticky;top:0;z-index:5;background:#0f1d3d;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:13px}.bar button{background:#c9a227;color:#000;border:0;padding:8px 16px;font-weight:700;cursor:pointer}
@media screen{.page{margin:14px auto;box-shadow:0 4px 18px rgba(0,0,0,.18)}}@media print{body{background:#fff}.bar{display:none}}`;

// The society's building, faint, behind every letterhead page (as on the printed letterhead). Turn off in the print bar.
const BG_IMG = `<img class="wm" src="/print/building-bg.jpg" alt="" aria-hidden="true">`;
const frameStart = `<section class="page"><div class="frame"><div class="inner">${BG_IMG}<div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>`;
const frameEnd = `</div></div></section>`;
/** A generic framed A4 page with the society header (used for minutes and other documents). */
export function docPage(kind: string, big: string, small: string, inner: string, footLeft: string, footRight = "") {
  return `${frameStart}${header(kind, big, small)}${inner}<div class="grow"></div><div class="foot"><div>${esc(footLeft)}</div><div>${esc(footRight)}</div></div>${frameEnd}`;
}
const header = (kind: string, big: string, small: string) => `<div class="head"><div class="seal">ॐ</div>
  <div class="soc"><h1>${esc(SOCIETY.full)}</h1><div class="a">${esc(SOCIETY.building)} • REG. NO. ${esc(SOCIETY.reg)} • DATED ${esc(SOCIETY.regDate)}</div><div class="a">Mirambica Road, Naranpura, Ahmedabad – 380013</div></div>
  <div class="title"><div class="t">${esc(kind)}</div><div class="f${big.length > 12 ? " long" : ""}">${esc(big)}</div><div class="s">${small}</div></div></div>`;
const flatLine = (f?: Flat) => (f ? `Flat <b>${esc(label(f))}</b> • Tower ${esc(f.tower)} • Floor ${esc(f.floor ?? "")}${f.bhk ? ` • ${esc(f.bhk)}` : ""}` : "");
function signBlock(s: Settings | null, name?: string | null, desig?: string | null, image?: string | null) {
  const stamp = s?.stamp_image || DEFAULT_STAMP;
  return `<div class="sign"><img class="stamp" src="${stamp}" alt=""><div class="sig"><div class="for">For Aakar Co-op Housing Society Ltd.</div>
    ${image ? `<img src="${image}" alt="">` : `<div class="blank"></div>`}
    <div class="l">${name ? `<b>${esc(name)}</b>` : ""}${esc(desig ? `Hon. ${desig}` : "Authorised signatory")}</div></div></div>`;
}

export type PrintCtx = { settings: Settings | null; signatories: Signatory[]; flats: Flat[] };
const sigImg = (c: PrintCtx, id?: string | null) => c.signatories.find((s) => s.id === id)?.signature_image || null;

export function billHtml(b: Bill, c: PrintCtx, prevDue = 0): string {
  const f = c.flats.find((x) => x.id === b.flat_id); const s = c.settings;
  const lines = b.lines?.length ? b.lines : [{ description: "Charges", amount: num(b.amount) }];
  const total = num(b.amount) + prevDue;
  const bank = s && (s.account_no || s.upi_id) ? `<div class="box"><div class="lbl">PAY BY BANK TRANSFER (NEFT / IMPS / UPI)</div><div class="kv" style="font-size:8.4pt">
      ${s.account_name ? `<span>Account name</span><b>${esc(s.account_name)}</b>` : ""}${s.bank_name ? `<span>Bank &amp; branch</span><b>${esc([s.bank_name, s.bank_branch].filter(Boolean).join(", "))}</b>` : ""}
      ${s.account_no ? `<span>Account no.</span><b>${esc(s.account_no)}</b>` : ""}${s.ifsc ? `<span>IFSC</span><b>${esc(s.ifsc)}</b>` : ""}${s.upi_id ? `<span>UPI ID</span><b>${esc(s.upi_id)}</b>` : ""}</div>
      <div class="ln" style="font-size:7.6pt">Please write <b>${esc(f ? label(f) : b.flat_id)}</b> in the payment remark.</div></div>` : `<div class="box"><div class="lbl">PAY BY BANK TRANSFER</div><div class="ln">Bank details are available from the society office.</div></div>`;
  return `${frameStart}${b.status === "cancelled" ? `<div class="void">CANCELLED</div>` : ""}
  ${header(b.kind === "maintenance" ? "MAINTENANCE BILL" : "BILL", f ? label(f) : b.flat_id, `Bill no. <b>${esc(b.bill_no)}</b>`)}
  <div class="meta"><div class="box"><div class="lbl">BILL TO</div><div class="nm">${esc(b.bill_to || f?.owner_name || "Member")}</div><div class="ln">${flatLine(f)}<br>${esc(SOCIETY.address)} – 380013</div></div>
    <div class="box"><div class="lbl">BILL DETAILS</div><div class="kv"><span>Bill date</span><b>${dmy(b.bill_date)}</b>${b.period_from ? `<span>Period</span><b>${dmy(b.period_from)} – ${dmy(b.period_to)}</b>` : ""}${b.due_date ? `<span>Due date</span><b>${dmy(b.due_date)}</b>` : ""}<span>Flat</span><b>${esc(f ? label(f) : b.flat_id)}</b></div></div></div>
  <table><tr><th style="width:8%">SR.</th><th>PARTICULARS</th><th style="width:18%">RATE</th><th class="r" style="width:20%">AMOUNT (₹)</th></tr>
    ${lines.map((l, i) => `<tr><td>${i + 1}</td><td class="n">${esc(l.description)}${b.kind === "maintenance" && b.period_from && i === 0 ? `<span class="sub">For the period ${dmy(b.period_from, true)} to ${dmy(b.period_to, true)} (${monthsIn(b.period_from, b.period_to!)} months)</span>` : ""}</td><td>${l.rate != null && l.qty != null ? `₹${inr(l.rate)} × ${l.qty}` : ""}</td><td class="r">${inr(l.amount, true)}</td></tr>`).join("")}
    ${prevDue > 0 ? `<tr class="mid"><td></td><td>Previous outstanding (earlier bills not yet paid)</td><td></td><td class="r">${inr(prevDue, true)}</td></tr>` : ""}
    <tr class="tot"><td></td><td colspan="2">TOTAL AMOUNT PAYABLE</td><td class="r">₹${inr(total, true)}</td></tr></table>
  <div class="words">Amount in words: <b>${esc(inWords(total))}</b></div>
  <div class="pay"><div class="box"><div class="lbl">PAY BY CHEQUE</div><div class="ln">In favour of <b>“${esc(s?.cheque_payee || "Aakar Co-op Housing Society Ltd.")}”</b><br>Write your flat number and mobile on the back of the cheque.</div></div>${bank}</div>
  <div class="note">${esc(s?.pay_note || "Kindly pay by the due date. A receipt will be issued by the society once your payment is received.")}<br>For any query about this bill, please contact the society office or the Treasurer.</div>
  ${signBlock(s, b.signer_name, b.signer_designation, sigImg(c, b.signer_id))}
  <div class="slip"><span class="cut">✂</span><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>PAYMENT SLIP • HAND IN WITH YOUR CHEQUE</h3><span style="font-size:7.6pt;color:var(--mute)">${esc(SOCIETY.full)}</span></div>
    <div class="fill"><div>Flat: <b>${esc(f ? label(f) : b.flat_id)}</b></div><div>Bill no.: <b>${esc(b.bill_no)}</b></div><div>Amount due: <b>₹${inr(total, true)}</b></div>
    <div>Name: <b>${esc(b.bill_to || f?.owner_name || "")}</b></div><div>Cheque / UTR no.:</div><div>Bank:</div><div>Amount paid: ₹</div><div>Date:</div><div>Member's signature:</div></div></div>
  <div class="foot"><div>Generated from the society app • ${dmy(today())}</div><div>Bill no. ${esc(b.bill_no)} • Flat ${esc(f ? label(f) : b.flat_id)}</div></div>${frameEnd}`;
}

export function receiptHtml(p: Payment, b: Bill, c: PrintCtx, allPays: Payment[]): string {
  const f = c.flats.find((x) => x.id === p.flat_id); const s = c.settings;
  const before = allPays.filter((x) => x.bill_id === b.id && x.status === "active" && x.id !== p.id && (x.paid_on < p.paid_on || (x.paid_on === p.paid_on && x.created_at < p.created_at)));
  const paidBefore = before.reduce((n, x) => n + num(x.amount), 0);
  const balAfter = Math.round((num(b.amount) - paidBefore - num(p.amount)) * 100) / 100;
  const name = p.received_from || b.bill_to || f?.owner_name || "Member";
  const what = b.kind === "maintenance" && b.period_from ? `maintenance charges for the period <b>${dmy(b.period_from, true)} to ${dmy(b.period_to, true)}</b>` : `<b>${esc(b.lines?.[0]?.description || "charges")}</b>`;
  const cheque = p.mode === "Cheque";
  return `${frameStart}${p.status === "cancelled" ? `<div class="void">CANCELLED</div>` : ""}
  ${header("RECEIPT", f ? label(f) : p.flat_id, `Receipt no. <b>${esc(p.receipt_no)}</b>`)}
  <div class="meta"><div class="box"><div class="lbl">RECEIVED FROM</div><div class="nm">${esc(name)}</div><div class="ln">${flatLine(f)}<br>${esc(SOCIETY.address)} – 380013</div></div>
    <div class="box"><div class="lbl">RECEIPT DETAILS</div><div class="kv"><span>Receipt date</span><b>${dmy(p.paid_on)}</b><span>Against bill</span><b>${esc(b.bill_no)}</b>${b.period_from ? `<span>Bill period</span><b>${dmy(b.period_from)} – ${dmy(b.period_to)}</b>` : ""}<span>Flat</span><b>${esc(f ? label(f) : p.flat_id)}</b></div></div></div>
  <div class="recv">Received with thanks from <b>${esc(name)}</b>, Flat <b>${esc(f ? label(f) : p.flat_id)}</b>, the sum of <span class="amt">₹${inr(p.amount, true)}</span> (<b>${esc(inWords(num(p.amount)))}</b>) towards ${what} against bill no. <b>${esc(b.bill_no)}</b> dated ${dmy(b.bill_date, true)}.${cheque ? ` <i>Subject to realisation of cheque.</i>` : ""}</div>
  <div class="sec"><div class="sh"><span>PAYMENT DETAILS</span><i></i></div>
  <table style="margin-top:2mm"><tr><th style="width:24%">MODE</th><th>BANK</th><th style="width:32%">${cheque ? "CHEQUE NO." : "TRANSACTION REF. (UTR)"}</th><th style="width:16%">DATE</th></tr>
    <tr><td class="n">${esc(p.mode === "NEFT" || p.mode === "IMPS" ? `Bank transfer (${p.mode})` : p.mode)}</td><td>${esc(p.bank || "—")}</td><td style="font-family:Consolas,monospace">${esc(p.ref || "—")}</td><td>${dmy(p.paid_on)}</td></tr></table></div>
  <div class="sec"><div class="sh"><span>ACCOUNT SUMMARY • BILL ${esc(b.bill_no)}</span><i></i></div>
  <table style="margin-top:2mm"><tr><th>PARTICULARS</th><th class="r" style="width:22%">AMOUNT (₹)</th></tr>
    <tr><td>Bill ${esc(b.bill_no)}${b.period_from ? ` • ${dmy(b.period_from)} – ${dmy(b.period_to)}` : ""}</td><td class="r">${inr(b.amount, true)}</td></tr>
    ${paidBefore ? `<tr><td>Less: received earlier</td><td class="r">– ${inr(paidBefore, true)}</td></tr>` : ""}
    <tr><td>Less: received vide this receipt</td><td class="r">– ${inr(p.amount, true)}</td></tr>
    <tr class="tot"><td>BALANCE DUE ON THIS BILL</td><td class="r">${balAfter <= 0 ? "NIL" : "₹" + inr(balAfter, true)}</td></tr></table></div>
  <div class="note">Thank you for your payment. Please keep this receipt for your records.</div>
  ${p.status === "active" ? `<div class="paid ${balAfter > 0 ? "part" : ""}">${balAfter > 0 ? "PART PAID" : "PAID"}<small>${balAfter > 0 ? `BALANCE ₹${inr(balAfter)}` : "IN FULL"} • ${dmy(p.paid_on).toUpperCase()}</small></div>` : ""}
  <div class="grow"></div>
  ${signBlock(s, p.signer_name, p.signer_designation, sigImg(c, p.signer_id))}
  <div class="foot"><div>Generated from the society app • ${dmy(today())}</div><div>Receipt no. ${esc(p.receipt_no)} • Flat ${esc(f ? label(f) : p.flat_id)}</div></div>${frameEnd}`;
}

export function statementHtml(f: Flat, bills: Bill[], pays: Payment[], c: PrintCtx): string {
  const live = bills.filter((b) => b.status === "active").sort((a, b) => a.bill_date.localeCompare(b.bill_date) || a.bill_no.localeCompare(b.bill_no));
  const t = flatTotals(live, pays);
  const rows = live.map((b) => {
    const ps = pays.filter((p) => p.bill_id === b.id && p.status === "active").sort((a, z) => a.paid_on.localeCompare(z.paid_on));
    const { balance } = billBalance(b, pays);
    const desc = b.period_from ? `${dmy(b.period_from)} – ${dmy(b.period_to)}` : esc(b.lines?.[0]?.description || "");
    const first = `<tr><td>${dmy(b.bill_date)}</td><td class="n">${esc(b.bill_no)}<span class="sub">${b.kind === "other" ? "Other • " : ""}${desc}</span></td><td class="r">${inr(b.amount)}</td>
      <td class="r">${ps[0] ? inr(ps[0].amount) : "—"}</td><td>${ps[0] ? dmy(ps[0].paid_on) : ""}</td><td>${ps[0] ? esc(ps[0].receipt_no) : ""}</td><td class="r" ${ps.length > 1 ? "" : `style="font-weight:700;color:${balance > 0 ? "#b26a00" : "#1f8a4c"}"`}>${ps.length > 1 ? "" : inr(balance)}</td></tr>`;
    let run = num(b.amount) - num(ps[0]?.amount);
    const more = ps.slice(1).map((p, k) => { run -= num(p.amount); const last = k === ps.length - 2; return `<tr><td></td><td style="color:var(--mute);font-size:8pt">↳ further payment</td><td></td><td class="r">${inr(p.amount)}</td><td>${dmy(p.paid_on)}</td><td>${esc(p.receipt_no)}</td><td class="r" ${last ? `style="font-weight:700;color:${run > 0 ? "#b26a00" : "#1f8a4c"}"` : ""}>${last ? inr(Math.round(run * 100) / 100) : ""}</td></tr>`; }).join("");
    return first + more;
  }).join("");
  return `${frameStart}${header("LEDGER STATEMENT", label(f), `As on <b>${dmy(today())}</b>`)}
  <div class="meta"><div class="box"><div class="lbl">MEMBER</div><div class="nm">${esc(f.owner_name || "Owner not recorded")}</div><div class="ln">${flatLine(f)}${f.occupancy === "tenant" && f.tenant_name ? `<br>Tenant: ${esc(f.tenant_name)}` : ""}</div></div>
    <div class="box"><div class="lbl">SUMMARY</div><div class="kv"><span>Total billed</span><b>₹${inr(t.billed, true)}</b><span>Total received</span><b>₹${inr(t.received, true)}</b><span>Balance due</span><b style="color:${t.due > 0 ? "#b26a00" : "#1f8a4c"}">${t.due > 0 ? "₹" + inr(t.due, true) : "NIL"}</b></div></div></div>
  <table><tr><th style="width:12%">BILL DATE</th><th>BILL NO. / PERIOD</th><th class="r" style="width:11%">BILL ₹</th><th class="r" style="width:11%">RECEIVED ₹</th><th style="width:12%">RECD. ON</th><th style="width:18%">RECEIPT NO.</th><th class="r" style="width:11%">BALANCE ₹</th></tr>
    ${rows || `<tr><td colspan="7" style="text-align:center;color:var(--mute)">No bills yet.</td></tr>`}
    <tr class="tot"><td colspan="2">TOTAL</td><td class="r">${inr(t.billed)}</td><td class="r">${inr(t.received)}</td><td colspan="2"></td><td class="r">${t.due > 0 ? inr(t.due) : "NIL"}</td></tr></table>
  <div class="note">This statement lists bills issued from the society app and payments recorded against them. The society's books of account are maintained separately.</div>
  <div class="grow"></div>
  <div class="foot"><div>Printed on ${dmy(today())} from the society app<br><b style="color:var(--navy);letter-spacing:.06em">FOR MEMBER'S INFORMATION</b></div><div>Flat ${esc(label(f))}</div></div>${frameEnd}`;
}

// ---------- letters ----------
export type Letter = {
  id: string; ref_no: string; flat_id: string; letter_date: string; owner_name: string | null; addressee: string;
  subject: string; body: string; signer_id: string | null; signer_name: string | null; signer_designation: string | null;
  status: "active" | "cancelled"; cancel_reason: string | null; created_by: string | null; created_at: string;
};
export function letterHtml(l: Letter, c: PrintCtx): string {
  const f = c.flats.find((x) => x.id === l.flat_id);
  const paras = l.body.trim().split(/\n\s*\n/).map((para) => `<p style="margin:0 0 4mm">${esc(para).replace(/\n/g, "<br>")}</p>`).join("");
  const general = l.addressee.trim().toUpperCase() === "TO WHOMSOEVER IT MAY CONCERN";
  const flatText = f ? `${label(f)}, Tower ${f.tower}, Floor ${f.floor ?? ""}, ${SOCIETY.building}` : l.flat_id;
  const N = (t: string) => `<b style="color:var(--navy)">${t}</b>`;
  const refDate = `<div>Ref. No.: ${N(esc(l.ref_no))}</div><div>Date: ${N(dmy(l.letter_date, true))}</div>`;
  const top = general
    ? `<div style="margin-top:6mm;font-size:10.5pt;line-height:1.6;color:#2a2822">${refDate}
        <div style="margin-top:4mm">Flat No.: ${N(esc(f ? label(f) : l.flat_id))}${f ? `, Tower ${esc(f.tower)}, Floor ${esc(f.floor ?? "")}, ${esc(SOCIETY.building)}` : ""}</div>
        <div>Owner: ${N(esc(l.owner_name || "—"))}</div></div>
      <div style="margin-top:8mm;text-align:center;font-size:12.5pt;font-weight:800;letter-spacing:.08em;color:var(--navy);text-decoration:underline;text-underline-offset:1.2mm">${esc(l.addressee)}</div>
      <div style="margin-top:7mm;font-size:11pt;color:var(--navy)"><b>Subject: ${esc(l.subject)}</b></div>`
    : `<div style="margin-top:6mm;font-size:10.5pt;line-height:1.6;color:#2a2822">${refDate}</div>
      <div style="margin-top:6mm;font-size:11pt;line-height:1.55;color:#1f1d18">To,<br>${esc(l.addressee.trim()).replace(/\n/g, "<br>")}</div>
      <div style="margin-top:6mm;font-size:11pt;color:var(--navy)"><b>Subject: ${esc(l.subject)}</b></div>
      <div style="margin-top:2mm;font-size:11pt;color:var(--navy)"><b>Ref.: Flat No. ${esc(flatText)} — Owner: ${esc(l.owner_name || "—")}</b></div>
      <div style="margin-top:6mm;font-size:11pt;color:#1f1d18">Dear Sir / Madam,</div>`;
  return `${frameStart}${header("LETTER", l.ref_no, `Date <b>${dmy(l.letter_date)}</b>`)}
  ${top}
  <div style="margin-top:${general ? 5 : 4}mm;font-size:11pt;line-height:1.75;color:#1f1d18;text-align:justify">${paras}</div>
  ${l.status === "cancelled" ? `<div class="void">CANCELLED</div>` : ""}
  <div style="margin-top:8mm;font-size:11pt;color:#1f1d18">Yours faithfully,</div>
  <div style="display:flex;align-items:flex-end;gap:8mm;margin-top:2mm">
    <div style="min-width:70mm">
      <div style="font-size:9pt;color:var(--navy);font-weight:700">For ${esc(SOCIETY.full)}</div>
      ${sigImg(c, l.signer_id) ? `<img src="${sigImg(c, l.signer_id)}" alt="" style="height:16mm;max-width:62mm;object-fit:contain;display:block;margin:2mm 0 1mm">` : `<div style="height:18mm"></div>`}
      <div style="border-top:.3mm solid var(--ink);padding-top:1mm;font-size:10.5pt"><b style="color:var(--navy)">${esc(l.signer_name || "")}</b><br><span style="font-size:9.5pt">${esc(l.signer_designation ? `Hon. ${l.signer_designation}` : "Authorised signatory")}</span></div>
    </div>
    <img src="${c.settings?.stamp_image || DEFAULT_STAMP}" alt="" style="width:30mm;height:30mm;object-fit:contain;transform:rotate(-8deg);opacity:.9">
  </div>
  <div style="margin-top:5mm;font-size:10.5pt;color:#1f1d18;display:flex;gap:14mm"><span>Place: <b>Ahmedabad</b></span><span>Date: <b>${dmy(l.letter_date, true)}</b></span></div>
  <div class="grow"></div>
  <div class="foot"><div>Generated from the society app • ${dmy(today())}</div><div>Ref. ${esc(l.ref_no)} • Flat ${esc(f ? label(f) : l.flat_id)}</div></div>${frameEnd}`;
}
export async function letterPdf(l: Letter, c: PrintCtx): Promise<File> {
  const { pagesToPdf } = await import("./pdfShare");
  return pagesToPdf([letterHtml(l, c)], CSS, `Letter_${l.ref_no.replace(/[^\w-]+/g, "-")}.pdf`);
}

/** The flat's ledger statement as a PDF file (for sharing on WhatsApp etc.). */
export async function statementPdf(f: Flat, bills: Bill[], pays: Payment[], c: PrintCtx): Promise<File> {
  const { pagesToPdf } = await import("./pdfShare");
  return pagesToPdf([statementHtml(f, bills, pays, c)], CSS, `Ledger_${label(f)}_${today()}.pdf`);
}

/** Dues list for the committee as an A4 PDF (no mobile numbers, since it is meant to be shared). */
export async function duesListPdf(rows: { f: Flat; due: number; count: number; oldest?: string }[], scope: string): Promise<File> {
  const { pagesToPdf } = await import("./pdfShare");
  const per = 24, total = rows.reduce((n, r) => n + r.due, 0);
  const chunks: typeof rows[] = []; for (let i = 0; i < Math.max(rows.length, 1); i += per) chunks.push(rows.slice(i, i + per));
  const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#1a1a18}
  .page{width:210mm;height:297mm;padding:14mm 13mm 12mm;display:flex;flex-direction:column;background:#fff}
  .hd{display:flex;align-items:center;gap:4mm;border-bottom:.6mm solid #0f1d3d;padding-bottom:3mm}
  .seal{width:13mm;height:13mm;border-radius:50%;background:#0f1d3d;color:#e2c25c;display:grid;place-items:center;font-size:18pt}
  h1{font-size:13pt;color:#0f1d3d;letter-spacing:.02em}.a{font-size:8pt;color:#6f6a5d;margin-top:.8mm}
  .t{margin-left:auto;text-align:right}.t b{display:block;font-size:8pt;letter-spacing:.2em;color:#b8932a}.t span{font-size:16pt;font-weight:800;color:#0f1d3d}
  .s{display:flex;justify-content:space-between;font-size:9pt;color:#6f6a5d;margin:3mm 0}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}th{background:#0f1d3d;color:#fff;text-align:left;padding:2mm;font-size:8pt;letter-spacing:.06em}
  td{padding:2mm;border-bottom:.25mm solid #e8e2d1}.r{text-align:right}.od{color:#b42318;font-weight:700}
  tr.tot td{font-weight:800;background:#f7f2e4;border-top:.4mm solid #0f1d3d}
  .ft{margin-top:auto;display:flex;justify-content:space-between;font-size:7.5pt;color:#6f6a5d;border-top:.25mm solid #e8e2d1;padding-top:2mm}`;
  const pages = chunks.map((ch, i) => `<section class="page"><div class="hd"><div class="seal">ॐ</div><div><h1>${esc(SOCIETY.full)}</h1>
    <div class="a">${esc(SOCIETY.building)} • REG. NO. ${esc(SOCIETY.reg)} • Mirambica Road, Naranpura, Ahmedabad – 380013</div></div>
    <div class="t"><b>DUES LIST</b><span>${esc(scope)}</span></div></div>
    <div class="s"><span>As on <b>${dmy(today())}</b> • ${rows.length} flat${rows.length === 1 ? "" : "s"} with dues</span><span>Total due <b style="color:#b26a00">₹${inr(total)}</b></span></div>
    <table><tr><th>FLAT</th><th>OWNER</th><th>UNPAID BILLS</th><th>OLDEST DUE DATE</th><th class="r">AMOUNT DUE ₹</th></tr>
    ${ch.map((r) => `<tr><td><b>${esc(label(r.f))}</b></td><td>${esc(r.f.owner_name || "—")}</td><td>${r.count}</td><td class="${r.oldest && r.oldest < today() ? "od" : ""}">${dmy(r.oldest)}${r.oldest && r.oldest < today() ? " • overdue" : ""}</td><td class="r">${inr(r.due)}</td></tr>`).join("")
      || `<tr><td colspan="5" style="text-align:center;color:#6f6a5d;padding:6mm">No dues. Every bill is paid.</td></tr>`}
    ${i === chunks.length - 1 ? `<tr class="tot"><td colspan="4">TOTAL</td><td class="r">${inr(total)}</td></tr>` : ""}</table>
    <div class="ft"><span>Generated from the society app on ${dmy(today())} • For committee use</span><span>Page ${i + 1} of ${chunks.length}</span></div></section>`);
  return pagesToPdf(pages, css, `Dues_List_${scope.replace(/\s+/g, "_")}_${today()}.pdf`);
}

/** Itemised WhatsApp text of a flat's unpaid bills, with bank details when set. */
export function duesText(f: Flat, bills: Bill[], pays: Payment[], s: Settings | null): string {
  const open = bills.filter((b) => b.flat_id === f.id && b.status === "active")
    .map((b) => ({ b, ...billBalance(b, pays) })).filter((x) => x.balance > 0)
    .sort((a, z) => a.b.bill_date.localeCompare(z.b.bill_date));
  const total = open.reduce((n, x) => n + x.balance, 0);
  const lines = open.map(({ b, paid, balance }) => {
    const what = b.period_from ? `maintenance ${dmy(b.period_from)} – ${dmy(b.period_to)}` : (b.lines?.[0]?.description || "other bill");
    return `• Bill ${b.bill_no} (${what}): ₹${inr(b.amount)}${paid > 0 ? `, paid ₹${inr(paid)}` : ""}, balance ₹${inr(balance)}${b.due_date ? `, due ${dmy(b.due_date)}` : ""}`;
  });
  const bank = s?.account_no && s?.ifsc
    ? `\n\nPay to: ${s.account_name || "Aakar Co-op Housing Society Ltd."}\n${s.bank_name || "Bank"}${s.bank_branch ? `, ${s.bank_branch}` : ""}\nA/c ${s.account_no} • IFSC ${s.ifsc}${s.upi_id ? `\nUPI: ${s.upi_id}` : ""}` : "";
  return `Aakar Co-op Housing Society: Gentle reminder for Flat ${label(f)} — dues as on ${dmy(today())}:\n${lines.join("\n")}\n\nTotal due: ₹${inr(total)}${bank}\n\nPlease pay at the earliest. Your full ledger is in the society app under MY FLAT. If already paid, kindly ignore. Thank you.`;
}

/** A society notice on the letterhead (any language: Gujarati prints with a Gujarati font). */
export type NoticeSigner = { name: string; designation: string; signature_image: string | null };
export function noticeHtml(n: { title: string | null; content: string | null; tower: string | null; created_at: string; file_url?: string | null }, c: PrintCtx, g?: NoticeSigner | null): string {
  const towers = !n.tower || /common|all/i.test(n.tower) ? "ALL MEMBERS" : `TOWER ${n.tower.replace(/tower\s*/i, "")}`;
  const date = String(n.created_at).slice(0, 10);
  const paras = String(n.content || "").trim().split(/\n\s*\n/).filter(Boolean).map((p) => `<p style="margin:0 0 4mm">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const img = n.file_url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(n.file_url) ? `<div style="margin-top:4mm;text-align:center"><img src="${esc(n.file_url)}" alt="" style="max-width:100%;max-height:110mm;object-fit:contain;border:.3mm solid var(--line)"></div>` : "";
  return `${frameStart}${header("NOTICE", towers, `Date <b>${dmy(date)}</b>`)}
  <div style="margin-top:6mm;font-size:10.5pt;color:#2a2822">To: <b style="color:var(--navy)">All ${towers === "ALL MEMBERS" ? "members" : `members of Tower ${towers.replace(/^TOWER\s*/, "")}`}</b></div>
  <div style="margin-top:6mm;text-align:center;font-size:15pt;font-weight:800;color:var(--navy);line-height:1.5">${esc(n.title || "Notice")}</div>
  <div style="width:30mm;height:.6mm;background:var(--gold);margin:2.5mm auto 0"></div>
  <div style="margin-top:6mm;font-size:12pt;line-height:1.85;color:#1f1d18">${paras}</div>${img}
  <div style="margin-top:6mm;font-size:10.5pt;color:#1f1d18">By order of the Managing Committee</div>
  <div style="display:flex;align-items:flex-end;gap:8mm;margin-top:2mm">
    <div style="min-width:70mm">
      <div style="font-size:9pt;color:var(--navy);font-weight:700">For ${esc(SOCIETY.full)}</div>
      ${g?.signature_image ? `<img src="${g.signature_image}" alt="" style="height:16mm;max-width:62mm;object-fit:contain;display:block;margin:2mm 0 1mm">` : `<div style="height:18mm"></div>`}
      <div style="border-top:.3mm solid var(--ink);padding-top:1mm;font-size:10.5pt">${g ? `<b style="color:var(--navy)">${esc(g.name)}</b><br>` : ""}<span style="font-size:9.5pt">${esc(g?.designation ? `Hon. ${g.designation}` : "Managing Committee")}</span></div>
    </div>
    <img src="${c.settings?.stamp_image || DEFAULT_STAMP}" alt="" style="width:30mm;height:30mm;object-fit:contain;transform:rotate(-8deg);opacity:.9">
  </div>
  <div style="margin-top:4mm;font-size:10.5pt;color:#1f1d18;display:flex;gap:14mm"><span>Place: <b>Ahmedabad</b></span><span>Date: <b>${dmy(date, true)}</b></span></div>
  <div class="grow"></div>
  <div class="foot"><div>Generated from the society app • ${dmy(today())}</div><div>Notice • ${esc(towers)}</div></div>${frameEnd}`;
}

/** Open pages in a new window (opened first so pop-up blockers allow it). */
export function openPrint(title: string, pages: string[], win?: Window | null) {
  const w = win || window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to print."); return; }
  w.document.open();
  // <base> so the building background (/print/building-bg.jpg) loads in this blank window; the tick in the bar turns it
  // off (remembered on this device), e.g. to save ink when printing many bills.
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${esc(window.location.origin)}/"><title>${esc(title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;600;700&display=swap"><style>${CSS}</style></head><body>
    <div class="bar">${backButton()}<button onclick="window.print()">PRINT / SAVE AS PDF</button><span>${pages.length} page${pages.length === 1 ? "" : "s"} • A4</span>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="aakarBg" style="width:18px;height:18px"> Building background</label></div>${pages.join("")}
    <script>(function(){var cb=document.getElementById('aakarBg'),on=true;try{on=localStorage.getItem('aakar_print_bg')!=='0'}catch(e){}
      function set(v){cb.checked=v;document.body.classList.toggle('nobg',!v);try{localStorage.setItem('aakar_print_bg',v?'1':'0')}catch(e){}}
      set(on);cb.onchange=function(){set(cb.checked)};
      var done=false;function go(){if(done)return;done=true;document.body.dataset.ready='1';window.print()}
      function imgs(){return Promise.all([].slice.call(document.images).map(function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r})}))}
      setTimeout(function(){Promise.all([document.fonts&&document.fonts.ready?document.fonts.ready:0,imgs()]).then(function(){setTimeout(go,150)})},500);setTimeout(go,3500)})()</script></body></html>`);
  w.document.close(); w.focus();
}
export function preparingWindow(text = "Preparing…") {
  const w = window.open("", "_blank");
  if (w) w.document.write(`<p style="font-family:Arial;padding:24px">${esc(text)}</p>`);
  return w;
}

/** WhatsApp message link (free; opens WhatsApp with text ready, member presses nothing — the sender taps send). */
export function waLink(mobile: string | null | undefined, text: string) {
  let m = String(mobile || "").replace(/\D/g, "");
  if (m.length === 10) m = "91" + m;
  return `https://wa.me/${m}?text=${encodeURIComponent(text)}`;
}
