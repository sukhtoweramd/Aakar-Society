"use client";
// Printable one-page A4 "Flat profile card" built from live data.
import { supabase } from "./supabaseClient";
import { listFiles } from "./ledgerClient";
import { byFamilyOrder, committeePeople, label, SOCIETY, sortFlats, type Flat } from "./society";
import { backButton, pdfButton } from "./printBack";

type Member = { flat_id: string; name: string | null; relation: string | null; mobile: string | null; age: number | null; is_head: boolean | null;
  email?: string | null; occupation?: string | null; business_name?: string | null; office_address?: string | null; office_phone?: string | null };
type Vehicle = { flat_id: string; vtype: string; model: string | null; plate: string | null; created_at?: string };
type Contact = { flat_id: string; name: string; relation: string | null; phone: string; location: string | null; created_at?: string };
type Doc = { type: string; name: string; date: string | null };
export type CardData = { flat: Flat & Record<string, any>; members: Member[]; vehicles: Vehicle[]; contacts: Contact[]; docs: Doc[] };

const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
const rupee = (n: any) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);
const fileName = (key: string) => key.split("/").pop()!.replace(/^\d{10,}_/, "");

async function rows<T>(table: string, flatIds: string[] | null): Promise<T[]> {
  let q = supabase.from(table).select("*");
  if (flatIds) q = q.in("flat_id", flatIds);
  const { data, error } = await q;
  return error ? [] : ((data as T[]) || []);
}

/** Load everything for the given flats. One flat also lists documents uploaded before document types existed. */
export async function loadCards(flats: Flat[]): Promise<CardData[]> {
  const ids = flats.map((f) => f.id);
  const filter = ids.length > 20 ? null : ids; // many flats: fetch all rows once instead of a long id list
  const [members, vehicles, contacts, fdocs] = await Promise.all([
    rows<Member>("members", filter), rows<Vehicle>("vehicles", filter), rows<Contact>("emergency_contacts", filter),
    rows<{ key: string; flat_id: string; doc_type: string | null; created_at: string }>("flat_docs", filter),
  ]);
  let r2: { key: string; uploaded: string | null }[] = [];
  if (flats.length === 1) r2 = await listFiles(`flats/${flats[0].id}`).catch(() => []);
  return [...flats].sort(sortFlats).map((f) => {
    const typed = fdocs.filter((x) => x.flat_id === f.id);
    const docs: Doc[] = typed.map((x) => ({ type: x.doc_type || "Document", name: fileName(x.key), date: x.created_at }));
    for (const o of r2) if (!typed.some((t) => t.key === o.key)) docs.push({ type: "Document (type not set)", name: fileName(o.key), date: o.uploaded });
    return {
      flat: f as any,
      members: members.filter((m) => m.flat_id === f.id).sort(byFamilyOrder),
      vehicles: vehicles.filter((v) => v.flat_id === f.id).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
      contacts: contacts.filter((c) => c.flat_id === f.id),
      docs: docs.sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    };
  });
}

function card(c: CardData, printed: string): string {
  const f = c.flat;
  const rented = f.occupancy === "tenant";
  const head = c.members.find((m) => m.is_head) || c.members[0];
  const sec = (title: string, body: string) => `<div class="sec"><div class="sh"><span>${title}</span><i></i></div>${body}</div>`;
  // Committee badges go on the person(s) who hold them (several family members may be on the committee).
  const people = committeePeople(f);
  const key = (s?: string | null) => (s || "").trim().toLowerCase();
  const tag = (role: string) => `<span class="tag g">★ ${esc(role.toUpperCase())}</span>`;
  const roleOf = (name?: string | null) => people.find((p) => key(p.name) === key(name))?.role || "";
  const badge = roleOf(f.owner_name) ? tag(roleOf(f.owner_name)) : "";

  const ownerBox = `<div class="box"><div class="lbl">${rented ? "OWNER • DOES NOT LIVE HERE" : "OWNER / HEAD OF FAMILY"}</div>
    <div class="nm">${esc(f.owner_name || "Owner not recorded")} ${badge}</div>
    <div class="ln">${[
      (rented ? f.owner_mobile : head?.mobile || f.owner_mobile) && `Mobile: ${esc(rented ? f.owner_mobile : head?.mobile || f.owner_mobile)}`,
      f.email && `Email: ${esc(f.email)}`,
      rented && f.owner_address && `Lives at: ${esc(f.owner_address)}`,
    ].filter(Boolean).join("<br>") || "Contact not recorded"}</div></div>`;
  const tenantBox = rented ? `<div class="box"><div class="lbl">TENANT • LIVES HERE</div>
    <div class="nm">${esc(f.tenant_name || "Tenant")}</div>
    <div class="ln">${[head?.mobile && `Mobile: ${esc(head.mobile)}`, f.tenant_from && `Living here from: <b>${d(f.tenant_from)}</b>`, f.agreement_until && `Rent agreement until: <b>${d(f.agreement_until)}</b>`].filter(Boolean).join("<br>")}</div></div>` : "";
  const memberBox = (f.member_since || f.share_cert_no) ? `<div class="box"><div class="lbl">MEMBERSHIP</div>
    <div class="ln" style="margin-top:1.2mm">${[f.member_since && `Member since: <b>${d(f.member_since)}</b>`, f.share_cert_no && `Share certificate no.: <b>${esc(f.share_cert_no)}</b>`].filter(Boolean).join("<br>")}</div></div>` : "";
  const boxes = [tenantBox, ownerBox, memberBox].filter(Boolean);

  const family = c.members.length ? sec(rented ? "TENANT'S FAMILY" : "FAMILY MEMBERS", `<table>
    <tr><th style="width:27%">NAME</th><th style="width:12%">RELATION</th><th style="width:7%">AGE</th><th style="width:16%">MOBILE</th><th>PROFESSION / BUSINESS</th></tr>
    ${c.members.map((m) => {
      const sub = [m.business_name, m.office_address, m.office_phone].filter(Boolean).join(" • ");
      return `<tr><td class="n">${esc(m.name)}${roleOf(m.name) && key(m.name) !== key(f.owner_name) ? ` ${tag(roleOf(m.name))}` : ""}</td><td>${esc(m.relation || "—")}</td><td>${m.age ?? "—"}</td><td>${esc(m.mobile || "—")}</td><td>${esc(m.occupation || (sub ? "" : "—"))}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</td></tr>`;
    }).join("")}</table>`) : "";
  const veh = c.vehicles.length ? sec("VEHICLES", `<table><tr><th style="width:30%">TYPE</th><th style="width:33%">MODEL</th><th>NUMBER</th></tr>
    ${c.vehicles.map((v) => `<tr><td style="white-space:nowrap">${esc(v.vtype.replace("4-wheeler", "4W").replace("2-wheeler", "2W"))}</td><td>${esc(v.model || "—")}</td><td>${v.plate ? `<span class="plate">${esc(v.plate)}</span>` : "—"}</td></tr>`).join("")}</table>`) : "";
  const emg = c.contacts.length ? sec("EMERGENCY CONTACTS", `<table><tr><th style="width:36%">NAME</th><th style="width:22%">RELATION</th><th>PHONE / LOCATION</th></tr>
    ${c.contacts.map((x) => `<tr><td class="n">${esc(x.name)}</td><td>${esc(x.relation || "—")}</td><td>${esc(x.phone)}${x.location ? `<span class="sub">${esc(x.location)}</span>` : ""}</td></tr>`).join("")}</table>`) : "";
  const vehEmg = veh && emg ? `<div class="two" style="align-items:start">${veh}${emg}</div>` : veh + emg;
  const docs = c.docs.length ? sec("DOCUMENTS WITH THE SOCIETY", `<table><tr><th style="width:34%">DOCUMENT TYPE</th><th>FILE</th><th style="width:18%">UPLOADED ON</th></tr>
    ${c.docs.map((x) => `<tr><td class="n">${esc(x.type)}</td><td>${esc(x.name)}</td><td>${d(x.date)}</td></tr>`).join("")}</table>`) : "";
  const consent = "directory_consent" in f ? sec("DIRECTORY CONSENT", f.directory_consent
    ? `<div class="consent"><div class="tick">✓</div><div><b>Family details shared with society members.</b>${f.directory_consent_at ? ` Consent given on ${d(f.directory_consent_at)}.` : ""} Names, relations and mobiles appear in the Member Directory; vehicles, emergency contacts and documents stay with the committee.</div></div>`
    : `<div class="consent no"><div class="tick">–</div><div><b>Family details not shared.</b> Only the flat number and ${rented ? "tenant" : "owner"} name appear in the Member Directory.</div></div>`) : "";
  const occupancy = rented ? "Rented" : f.occupancy === "owner" || !("occupancy" in f) ? "Owner-occupied" : "—";
  const occupied = ["filled", "occupied", "sold", "approved"].includes((f.status || "").toLowerCase());

  return `<section class="page"><div class="frame"><div class="inner">
  <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
  <div class="content">
  <div class="head">
    <div class="seal">ॐ</div>
    <div class="soc"><h1>${esc(SOCIETY.full)}</h1>
      <div class="a">${esc(SOCIETY.building)} • REG. NO. ${esc(SOCIETY.reg)} • DATED ${esc(SOCIETY.regDate)}</div>
      <div class="a">Mirambica Road, Naranpura, Ahmedabad – 380013</div></div>
    <div class="title"><div class="t">FLAT PROFILE CARD</div><div class="f">${esc(label(f))}</div><div class="s">Tower ${esc(f.tower)} • Floor ${esc(f.floor ?? "")}</div></div>
  </div>
  <div class="strip">
    <div><small>TYPE</small><b>${esc(f.bhk || "—")}</b></div>
    <div><small>BUILT-UP</small><b>${f.sqft ? `${Number(f.sqft).toLocaleString("en-IN")} sq ft` : "—"}</b></div>
    <div><small>MAINTENANCE</small><b>${f.maintenance != null ? `${rupee(f.maintenance)} / year` : "—"}</b></div>
    <div><small>OCCUPANCY</small><b>${occupancy}</b></div>
    <div><small>STATUS</small><b style="color:${occupied ? "#1f8a4c" : "#b26a00"}">${occupied ? "Occupied" : esc(f.status || "Pending")}</b></div>
  </div>
  ${sec(rented ? "TENANT &amp; OWNER" : "OWNER", `<div class="grid g${boxes.length}">${boxes.join("")}</div>`)}
  ${family}${vehEmg}${docs}${consent}
  </div>
  <div class="foot">
    <div>Printed on ${esc(printed)} from the society app<br><span class="conf">CONFIDENTIAL • FOR SOCIETY RECORDS ONLY</span></div>
    <div class="sign"><div class="l">Member's signature</div></div>
    <div class="sign"><div class="l">Secretary</div></div>
  </div>
</div></div></section>`;
}

const CSS = `@page{size:A4 portrait;margin:0}
:root{--navy:#0f1d3d;--gold:#b8932a;--cream:#fbf7ec;--line:#e2d9c0;--ink:#1a1a18;--mute:#6f6a5d}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{background:#e9e6dc;font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--ink)}
.page{position:relative;width:210mm;height:297mm;padding:9mm;background:#fff;break-after:page;overflow:hidden}
.page:last-child{break-after:auto}
.frame{height:100%;border:2.2mm solid var(--navy);padding:1.6mm;position:relative}
.inner{height:100%;border:0.5mm solid var(--gold);padding:6mm 8mm 5mm;position:relative;display:flex;flex-direction:column;overflow:hidden;
  background:radial-gradient(circle at 100% 0,#faf7f0,#fff 40%)}
.content{transform-origin:top left}
.corner{position:absolute;width:2.6mm;height:2.6mm;background:var(--gold);transform:rotate(45deg)}
.c1{left:-1.55mm;top:-1.55mm}.c2{right:-1.55mm;top:-1.55mm}.c3{left:-1.55mm;bottom:-1.55mm}.c4{right:-1.55mm;bottom:-1.55mm}
.head{display:flex;align-items:center;gap:5mm;padding-bottom:3mm;border-bottom:0.6mm solid var(--navy)}
.seal{width:17mm;height:17mm;border-radius:50%;border:0.6mm solid var(--gold);display:grid;place-items:center;font-size:24pt;color:var(--gold);background:var(--navy);flex:none}
.soc{flex:1;min-width:0}
.soc h1{font-weight:800;font-size:14pt;white-space:nowrap;letter-spacing:.02em;color:var(--navy)}
.soc .a{font-size:8.2pt;color:var(--mute);margin-top:1mm}
.title{text-align:right}
.title .t{font-size:8pt;letter-spacing:.24em;color:var(--gold);font-weight:700}
.title .f{font-weight:800;font-size:30pt;color:var(--navy);line-height:1;white-space:nowrap}
.title .s{font-size:8pt;color:var(--mute);margin-top:.8mm}
.strip{display:grid;grid-template-columns:repeat(5,1fr);margin-top:4mm;border:0.3mm solid var(--line);background:var(--cream)}
.strip div{padding:1.8mm 3mm;border-right:0.3mm solid var(--line)}
.strip div:last-child{border-right:0}
.strip small{display:block;font-size:6.6pt;letter-spacing:.14em;color:var(--mute);font-weight:600}
.strip b{font-size:10pt;color:var(--navy);white-space:nowrap}
.sec{margin-top:3.2mm}
.sh{display:flex;align-items:center;gap:2.5mm;margin-bottom:1.6mm}
.sh span{font-size:8pt;font-weight:800;letter-spacing:.2em;color:var(--navy)}
.sh i{flex:1;height:0.3mm;background:linear-gradient(90deg,var(--gold),transparent)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm}
.grid{display:grid;gap:3.5mm}.g1{grid-template-columns:1fr}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr 1fr}
.box{border:0.3mm solid var(--line);padding:2.4mm 3.5mm;background:#fff}
.box .lbl{font-size:6.6pt;letter-spacing:.16em;color:var(--gold);font-weight:700}
.box .nm{font-size:13pt;font-weight:700;color:var(--navy);margin-top:.6mm}
.box .ln{font-size:8.6pt;color:#3a372f;margin-top:.8mm;line-height:1.45}
.tag{display:inline-block;font-size:6.6pt;font-weight:700;letter-spacing:.1em;padding:.5mm 1.6mm;background:var(--navy);color:#fff;vertical-align:middle;margin-left:1.5mm}
.tag.g{background:var(--gold)}
table{width:100%;border-collapse:collapse;font-size:8.2pt}
th{background:var(--navy);color:#fff;text-align:left;font-weight:600;font-size:7pt;letter-spacing:.06em;padding:1.3mm 2.4mm}
td{padding:1.25mm 2.4mm;border-bottom:0.25mm solid var(--line);vertical-align:top}
tr:nth-child(even) td{background:var(--cream)}
td.n{font-weight:600;color:var(--navy)}
td .sub{display:block;font-size:7.4pt;color:var(--mute);margin-top:.3mm}
.plate{white-space:nowrap;font-family:Consolas,"DejaVu Sans Mono",monospace;font-weight:700;letter-spacing:.06em;border:0.3mm solid var(--navy);padding:.3mm 1.6mm;background:#fff;font-size:8.4pt}
.consent{display:flex;gap:3mm;align-items:flex-start;border:0.3mm solid #9fd3b4;background:#effaf3;padding:2mm 3.5mm;font-size:8pt;color:#1f4d33}
.consent.no{border-color:var(--line);background:var(--cream);color:#4a463c}
.tick{width:4.4mm;height:4.4mm;background:#1f8a4c;color:#fff;display:grid;place-items:center;font-size:8pt;font-weight:800;flex:none}
.consent.no .tick{background:#9a9384}
.foot{margin-top:auto;padding-top:3mm;border-top:0.3mm solid var(--line);display:flex;justify-content:space-between;align-items:flex-end;font-size:7.2pt;color:var(--mute);flex:none}
.sign{text-align:center;min-width:45mm}
.sign .l{border-top:0.3mm solid var(--ink);margin-top:6mm;padding-top:1mm;font-size:7.4pt;color:var(--ink)}
.conf{font-weight:700;color:var(--navy);letter-spacing:.06em}
.bar{position:sticky;top:0;z-index:5;background:#0f1d3d;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:13px}
.bar button{background:#c9a227;color:#000;border:0;padding:8px 16px;font-weight:700;cursor:pointer}
@media screen{.page{margin:14px auto;box-shadow:0 4px 18px rgba(0,0,0,.18)}}
@media print{body{background:#fff}.bar{display:none}}`;

// Shrinks a card's content just enough to keep it on one page (e.g. a very large family).
const FIT = `<script>
function fit(){document.querySelectorAll('.inner').forEach(function(inner){
  var c=inner.querySelector('.content'),foot=inner.querySelector('.foot');c.style.zoom=1;
  var avail=inner.clientHeight-foot.offsetHeight-parseFloat(getComputedStyle(inner).paddingTop)-parseFloat(getComputedStyle(inner).paddingBottom)-8;
  if(c.scrollHeight>avail){c.style.zoom=Math.max(0.6,avail/c.scrollHeight);}});}
(window.FONT||Promise.resolve()).then(function(){return Promise.race([document.fonts?document.fonts.ready:null,new Promise(function(r){setTimeout(r,2500)})])}).then(function(){fit();document.body.dataset.ready='1';if(window.AUTO_PRINT)setTimeout(function(){window.print()},300);});
</script>`;

/** Opens the cards in a new window, ready to print or save as PDF (one A4 page per flat). */
export function openCards(cards: CardData[], title: string, win?: Window | null) {
  const w = win || window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to print the card."); return; }
  const printed = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${CSS}</style><script>window.AUTO_PRINT=true;
      (function(){var l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
      window.FONT=new Promise(function(r){l.onload=l.onerror=r;setTimeout(r,3000)});document.head.appendChild(l);})();</script></head><body>
    <div class="bar">${backButton()}${pdfButton()}<button onclick="window.print()">PRINT</button><span>${cards.length} card${cards.length === 1 ? "" : "s"} • one A4 page each</span></div>
    ${cards.map((c) => card(c, printed)).join("")}${FIT}</body></html>`);
  w.document.close();
  w.focus();
}

/** Open a window immediately (so pop-up blockers allow it), then fill it once data has loaded. */
export async function printFlatCards(flats: Flat[], title: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to print the card."); return; }
  w.document.write(`<p style="font-family:Arial;padding:24px">Preparing ${flats.length === 1 ? "the card" : `${flats.length} cards`}…</p>`);
  try { openCards(await loadCards(flats), title, w); }
  catch (e: any) { w.document.body.innerHTML = `<p style="font-family:Arial;padding:24px;color:#b00">Could not prepare the card: ${esc(e.message)}</p>`; }
}
