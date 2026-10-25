"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { COMMITTEE_ROLES, committeeBadge, floorOf, isOccupied, isRented, label, ownerText, rupees, statusText, unitOf, VAULT_SLOTS, type Flat, type StoredFile } from "@/lib/society";
import { api, deleteFile, fmtDate, fmtSize, listFiles, uploadFile } from "@/lib/ledgerClient";
import type { Ctx } from "./ctx";
import MembersPanel from "./MembersPanel";
import ConsentCard from "./ConsentCard";
import FlatListPanel, { VEHICLE_TYPES } from "./FlatListPanel";
import { printFlatCards } from "@/lib/flatCard";
import MyBills from "./billing/MyBills";
import LettersPanel from "./billing/LettersPanel";
import WhoToContact, { useContacts } from "./WhoToContact";
import MyActionPoints from "./MyActionPoints";
import ComplaintsPanel from "./ComplaintsPanel";
import NomineePanel from "./NomineePanel";
import BookingPanel from "./BookingPanel";
import { FileLink } from "./SecureFile";
import { DOC_TYPES, OTHER, docChecklist } from "@/lib/flatDocTypes";
import { compressForUpload, sizeNote } from "@/lib/compressFile";


export default function DetailTab({ ctx }: { ctx: Ctx }) {
  const { flats, categories, selectedId, selectFlat, go, reloadFlats, isCommittee, myFlat } = ctx;
  const f = flats.find((x) => x.id === (isCommittee ? selectedId : myFlat)) || null;
  const [docs, setDocs] = useState<StoredFile[]>([]);
  const [vault, setVault] = useState<StoredFile[]>([]);
  const [editing, setEditing] = useState(false);
  const [jumpNote, setJumpNote] = useState("");
  const contacts = useContacts();
  function jump(id: string, emptyMsg: string) {
    const el = document.getElementById(id);
    if (!el || (emptyMsg && el.offsetHeight < 8)) { setJumpNote(emptyMsg); setTimeout(() => setJumpNote(""), 5000); return; }
    setJumpNote(""); el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const [form, setForm] = useState<Partial<Flat>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [familyVersion, setFamilyVersion] = useState(0); // bump to make the family list reload
  const [docTypes, setDocTypes] = useState<Record<string, string>>({}); // R2 key -> document type
  const [docTypesReady, setDocTypesReady] = useState(true);
  const [newDocType, setNewDocType] = useState("");    // chosen from DOC_TYPES, or OTHER
  const [otherDocType, setOtherDocType] = useState(""); // typed when OTHER is chosen
  const [docNote, setDocNote] = useState("");           // "Compressed 4.2 MB → 0.6 MB"
  const [editDocKey, setEditDocKey] = useState<string | null>(null);
  const [editDocType, setEditDocType] = useState("");

  async function loadExtras(id: string) {
    setError("");
    listFiles(`flats/${id}`).then(setDocs).catch((e) => setError(e.message));
    supabase.from("flat_docs").select("key, doc_type").eq("flat_id", id).then(({ data, error }) => {
      setDocTypesReady(!error);
      setDocTypes(Object.fromEntries(((data as any[]) || []).map((d) => [d.key, d.doc_type || ""])));
    });
    listFiles("vault").then(setVault).catch(() => {});
  }
  useEffect(() => { if (f) { loadExtras(f.id); setEditing(false); } }, [f?.id]);

  if (!f) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-10 text-center fade-in">
        <div className="h-12 w-12 mx-auto rounded-full border border-[var(--gold)] grid place-items-center serif text-[24px]">!</div>
        <div className="serif text-[22px] font-bold mt-4">No Flat Selected</div>
        <div className="mono text-[12px] opacity-60 mt-2 max-w-[320px] mx-auto">Select a flat from INDEX to view owner, maintenance, floor, tower, status, documents and family members.</div>
        <button onClick={() => go("INDEX")} className="btn-navy mt-6 mono text-[12px] tracking-[0.12em] px-6 py-3">Go to INDEX →</button>
      </div>
    );
  }

  const cat = categories.find((c) => c.ids.includes(f.id));
  const terrace = !!cat?.terrace;
  const hasSqft = "sqft" in f;
  const tenantReady = "occupancy" in f; // TENANTS.sql has been run
  const rented = isRented(f);
  const lockOwner = !isCommittee && rented; // a tenant can't change the owner's details
  const agreementOver = rented && !!f.agreement_until && new Date(f.agreement_until) < new Date(new Date().toDateString());
  const vaultDocs = VAULT_SLOTS.map((s) => ({ ...s, file: vault.find((v) => v.key.startsWith(`vault/${s.id}.`)) })).filter((s) => s.file);

  async function save() {
    setBusy("save"); setError("");
    const personal: any = { owner_name: form.owner_name?.trim() || null, email: form.email?.trim() || null };
    if (tenantReady) {
      const t = form.occupancy === "tenant";
      if (t && !form.tenant_name?.trim()) { setBusy(null); setError("Enter the tenant's name"); return; }
      Object.assign(personal, {
        occupancy: t ? "tenant" : "owner",
        owner_mobile: form.owner_mobile?.trim() || null,
        owner_address: t ? form.owner_address?.trim() || null : null,
        tenant_name: t ? form.tenant_name!.trim() : null,
        tenant_from: t ? form.tenant_from || null : null,
        agreement_until: t ? form.agreement_until || null : null,
      });
      if (lockOwner) { delete personal.owner_name; delete personal.email; delete personal.owner_mobile; delete personal.owner_address; delete personal.occupancy; }
      // Owner-occupied -> rented out: the owner's family no longer lives here.
      if (t && !rented) {
        const { data: fam } = await supabase.from("members").select("id").eq("flat_id", f!.id);
        if (fam?.length && confirm(`Remove the ${fam.length} family member(s) now listed for ${label(f!)}? They are the owner's family and no longer live here; their vehicles and emergency contacts will be removed too. The tenant's family can then be added.\n\nOK = remove, Cancel = keep them`)) {
          const e = await clearFamily(); if (e) { setBusy(null); setError(e); return; }
        }
        if ("directory_consent" in f!) personal.directory_consent = false; // the tenant decides on sharing
      }
      // Rented -> owner lives here again: the tenant's family has left.
      if (!t && rented) {
        const { data: fam } = await supabase.from("members").select("id").eq("flat_id", f!.id);
        if (fam?.length && confirm(`The tenant has left ${label(f!)}. Remove the tenant's ${fam.length} family member(s), vehicles and emergency contacts?\n\nOK = remove, Cancel = keep them`)) {
          const e = await clearFamily(); if (e) { setBusy(null); setError(e); return; }
        }
        if ("directory_consent" in f!) personal.directory_consent = false;
      }
    }
    if (!isCommittee) {
      const { error } = await supabase.from("flats").update(personal).eq("id", f!.id);
      setBusy(null);
      if (error) { setError(error.message); return; }
      setEditing(false); setFamilyVersion((v) => v + 1); reloadFlats(); return;
    }
    const upd: any = {
      ...personal,
      status: form.status || null,
      is_committee: !!form.is_committee,
      ...("committee_role" in f! ? { committee_role: form.is_committee ? form.committee_role?.trim() || "Committee Member" : null } : {}),
      bhk: form.bhk?.trim() || null,
      maintenance: form.maintenance === null || form.maintenance === undefined || (form.maintenance as any) === "" ? null : Number(form.maintenance),
    };
    if ("member_since" in f!) { upd.member_since = form.member_since || null; upd.share_cert_no = form.share_cert_no?.trim() || null; }
    if (hasSqft) upd.sqft = form.sqft === null || form.sqft === undefined || (form.sqft as any) === "" ? null : Number(form.sqft);
    const { error } = await supabase.from("flats").update(upd).eq("id", f!.id);
    if (error) { setBusy(null); setError(error.message); return; }
    // Left the committee: remove their committee (admin) login too, so access is never forgotten.
    if (f!.is_committee && !upd.is_committee) {
      try {
        const { members } = await api("/api/committee");
        const linked = (members || []).filter((m: any) => m.flat_id === f!.id && !m.main);
        if (linked.length && confirm(`${label(f!)} is no longer on the committee.\n\nRemove the committee (admin) login of ${linked.map((m: any) => m.email).join(", ")} now? Their normal flat login is not affected.\n\nOK = remove now (recommended), Cancel = keep for now (ADMIN will show a warning)`)) {
          const r = await api("/api/committee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke_flat", flat_id: f!.id }) });
          if (r.kept?.length) alert(`Not removed: ${r.kept.join(", ")}. Remove it from ADMIN using another committee login.`);
        }
      } catch (e: any) { setError(`Saved, but the committee login could not be checked: ${e.message}. Please check ADMIN.`); }
    }
    setBusy(null);
    setEditing(false);
    setFamilyVersion((v) => v + 1);
    reloadFlats();
  }

  // Delete every family member of this flat (and the vehicles and emergency contacts of the people who lived there);
  // report if the database refused (0 rows removed).
  async function clearFamily(): Promise<string | null> {
    for (const t of ["vehicles", "emergency_contacts"]) {
      const { error } = await supabase.from(t).delete().eq("flat_id", f!.id);
      if (error && !/does not exist|could not find the table|schema cache/i.test(error.message)) return error.message;
    }
    const { data: before } = await supabase.from("members").select("id").eq("flat_id", f!.id);
    if (!before?.length) return null;
    const { data, error } = await supabase.from("members").delete().eq("flat_id", f!.id).select("id");
    if (error) return error.message;
    if ((data?.length || 0) < before.length) return "Some family members could not be removed. Please remove them with ✕ in the family list.";
    return null;
  }

  async function tenantMovedOut() {
    if (!confirm(`Tenant ${f!.tenant_name || ""} has moved out of ${label(f!)}?\n\nThis will:\n• remove the tenant, the tenant's family members, vehicles and emergency contacts\n• turn off directory sharing\n• mark the flat as owner-occupied (enter a new tenant with EDIT FLAT if it is rented again)`)) return;
    setBusy("out"); setError("");
    const famErr = await clearFamily();
    if (famErr) { setBusy(null); setError(famErr); return; }
    const upd: any = { occupancy: "owner", tenant_name: null, tenant_from: null, agreement_until: null, owner_address: null };
    if ("directory_consent" in f!) upd.directory_consent = false;
    const { error } = await supabase.from("flats").update(upd).eq("id", f!.id);
    setBusy(null);
    if (error) { setError(error.message); return; }
    alert(`Done. The tenant and family have been removed. Now reset the ${label(f!)} flat login password (ADMIN → Flat logins → Reset) so the old tenant can no longer log in.`);
    setFamilyVersion((v) => v + 1);
    reloadFlats();
  }

  const chosenDocType = () => (newDocType === OTHER ? otherDocType.trim() : newDocType);
  async function uploadDoc(original: File) {
    const type = chosenDocType();
    if (docTypesReady && !type) { setError("First choose which document it is, then choose the file."); return; }
    setBusy("doc"); setError(""); setDocNote("");
    try {
      const c = await compressForUpload(original);
      if (c.file.size > 4 * 1024 * 1024) throw new Error(`The file is ${sizeNote(c).replace(/^Uploaded as it is /, "")} even after compressing; the limit is 4 MB. Scan at a lower resolution or split it.`);
      const up = await uploadFile(c.file, `flats/${f!.id}`);
      setDocNote(`${type || "Document"}: ${sizeNote(c)}`);
      if (docTypesReady && up.key) {
        const { error } = await supabase.from("flat_docs").upsert({ key: up.key, flat_id: f!.id, doc_type: type, uploaded_by: ctx.email });
        if (error) setError(`File uploaded, but the document type was not saved: ${error.message}`);
      }
      setNewDocType(""); setOtherDocType("");
      await loadExtras(f!.id);
    } catch (e: any) { setError(e.message); }
    setBusy(null);
  }
  async function saveDocType(key: string) {
    const { error } = await supabase.from("flat_docs").upsert({ key, flat_id: f!.id, doc_type: editDocType.trim() || null, uploaded_by: ctx.email });
    if (error) { setError(error.message); return; }
    setEditDocKey(null); loadExtras(f!.id);
  }
  async function removeDoc(d: StoredFile) {
    if (!confirm(`Delete "${docTypes[d.key] || d.name}"?`)) return;
    try {
      await deleteFile({ key: d.key });
      if (docTypesReady) await supabase.from("flat_docs").delete().eq("key", d.key);
      await loadExtras(f!.id);
    } catch (e: any) { setError(e.message); }
  }

  const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-[var(--border)] p-4 bg-[var(--bg)]"><div className="mono text-[10px] opacity-60">{title}</div>{children}</div>
  );

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="mono text-[10px] tracking-[0.2em] opacity-60">{isCommittee ? "FLAT DETAIL • SELECTED" : "MY FLAT"}</div>
            <div className="serif text-[32px] font-bold mt-1">{label(f)}{f.is_committee && <span className="text-[var(--gold)] text-[16px] align-middle ml-2 mono">{committeeBadge(f)}</span>}{terrace && <span className="ml-3 align-middle mono text-[10px] bg-amber-400 text-black px-1.5 py-0.5 font-bold">TERRACE • OWNER</span>}</div>
            <div className="mono text-[11px] mt-1 opacity-70">Owner: {ownerText(f)}{rented ? ` • On rent to: ${f.tenant_name || "—"}` : ""} • Status: {statusText(f)} • Type: {f.bhk || "—"} • Tower {f.tower} • Floor {floorOf(f)}{f.is_committee ? ` • ${committeeBadge(f)}` : ""}</div>
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            {isCommittee && rented && <button onClick={tenantMovedOut} disabled={!!busy} className="btn-line mono text-[11px] px-3 py-2 text-red-700">{busy === "out" ? "UPDATING…" : "TENANT MOVED OUT"}</button>}
            {isCommittee && <button onClick={() => go("INDEX")} className="btn-line mono text-[11px] px-3 py-2">← BACK TO INDEX</button>}
            <button onClick={() => go("FLOOR")} className="btn-navy mono text-[11px] px-3 py-2">VIEW FLOOR</button>
            <button onClick={() => printFlatCards([f], `Flat Profile Card – ${label(f)}`)} className="btn-navy mono text-[11px] px-3 py-2">{isCommittee && f.id !== ctx.homeFlat ? "PRINT CARD" : "PRINT MY CARD"}</button>
            <button onClick={() => { setForm({ ...f }); setEditing((v) => !v); }} className="btn-gold mono text-[11px] px-3 py-2">{editing ? "CANCEL EDIT" : isCommittee ? "EDIT FLAT" : "EDIT MY DETAILS"}</button>
            {!isCommittee && <>
              <button onClick={() => jump("sec-ledger", "No bills have been issued for your flat yet.")} className="btn-line mono text-[11px] px-3 py-2 font-bold">MY LEDGER ↓</button>
              <button onClick={() => jump("sec-vehicles", "")} className="btn-line mono text-[11px] px-3 py-2 font-bold">MY VEHICLES ↓</button>
              <button onClick={() => jump("sec-letters", "No letters have been issued for your flat yet.")} className="btn-line mono text-[11px] px-3 py-2 font-bold">MY LETTERS ↓</button>
              <button onClick={() => jump("sec-contacts", "The committee has not set up who to contact yet.")} className="btn-line mono text-[11px] px-3 py-2 font-bold">WHO TO CONTACT ↓</button>
              <button onClick={() => jump("sec-complaints", "Complaints are not switched on yet.")} className="btn-line mono text-[11px] px-3 py-2 font-bold">COMPLAINTS ↓</button>
              <button onClick={() => jump("sec-booking", "Bookings are not switched on yet.")} className="btn-line mono text-[11px] px-3 py-2 font-bold">BOOK COMMON PLOT ↓</button>
              {!rented && <button onClick={() => jump("sec-nominee", "The nominee form is not switched on yet.")} className="btn-line mono text-[11px] px-3 py-2 font-bold">NOMINEE ↓</button>}
            </>}
          </div>
        </div>
        {error && <div className="mt-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[11px]">{error}</div>}
        {jumpNote && <div className="mt-3 border border-[var(--border)] bg-[var(--bg-soft)] p-2.5 mono text-[11px]">{jumpNote}</div>}
        {(!isCommittee || f.id === ctx.homeFlat) && <MyActionPoints key={f.id} flats={flats} />}
        {(!isCommittee || f.id === ctx.homeFlat) && <ComplaintsPanel key={`c-${f.id}`} mode="flat" flats={flats} flatId={f.id} isCommittee={isCommittee} />}
        {(!isCommittee || f.id === ctx.homeFlat) && <BookingPanel key={`b-${f.id}`} mode="flat" flats={flats} flatId={f.id} isCommittee={isCommittee} />}
        {(isCommittee || !rented) && <NomineePanel key={`n-${f.id}`} flat={f} isCommittee={isCommittee} email={ctx.email} />}

        {editing && (
          <div className="mt-5 border border-[var(--gold)] bg-[#fffdf5] p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mono text-[11px]">
            {tenantReady && (
              <div className="sm:col-span-2 lg:col-span-4">
                WHO LIVES IN THIS FLAT?
                <div className="flex flex-wrap gap-4 mt-1">
                  {(["owner", "tenant"] as const).map((o) => (
                    <label key={o} className={`flex items-center gap-2 border px-3 py-2 cursor-pointer ${(form.occupancy || "owner") === o ? "border-[var(--navy)] bg-white font-bold" : "border-[var(--border)]"} ${lockOwner ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <input type="radio" name="occ" disabled={lockOwner} checked={(form.occupancy || "owner") === o} onChange={() => setForm({ ...form, occupancy: o })} />
                      {o === "owner" ? "Owner lives here" : "Given on rent (tenant lives here)"}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {form.occupancy === "tenant" && <>
              <div className="sm:col-span-2 lg:col-span-4 text-[10px] tracking-[0.14em] opacity-60 border-t border-[var(--border)] pt-2">TENANT • the family list below will be the tenant&apos;s family</div>
              <label className="sm:col-span-2">TENANT NAME *<input className="field mt-1" value={form.tenant_name || ""} onChange={(e) => setForm({ ...form, tenant_name: e.target.value })} /></label>
              <label>LIVING HERE FROM<input className="field mt-1" type="date" value={form.tenant_from || ""} onChange={(e) => setForm({ ...form, tenant_from: e.target.value })} /></label>
              <label>RENT AGREEMENT UNTIL<input className="field mt-1" type="date" value={form.agreement_until || ""} onChange={(e) => setForm({ ...form, agreement_until: e.target.value })} /></label>
              <div className="sm:col-span-2 lg:col-span-4 text-[10px] tracking-[0.14em] opacity-60 border-t border-[var(--border)] pt-2">OWNER (does not live here){lockOwner ? " • only the committee can change these" : ""}</div>
            </>}
            <label className="sm:col-span-2">OWNER NAME<input className="field mt-1" disabled={lockOwner} value={form.owner_name || ""} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></label>
            <label className="sm:col-span-2">OWNER EMAIL<input className="field mt-1" type="email" disabled={lockOwner} value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            {tenantReady && form.occupancy === "tenant" && <>
              <label>OWNER MOBILE<input className="field mt-1" disabled={lockOwner} value={form.owner_mobile || ""} onChange={(e) => setForm({ ...form, owner_mobile: e.target.value })} /></label>
              <label className="lg:col-span-3">OWNER&apos;S PRESENT ADDRESS<input className="field mt-1" disabled={lockOwner} value={form.owner_address || ""} onChange={(e) => setForm({ ...form, owner_address: e.target.value })} /></label>
            </>}
            {isCommittee && <>
            <label>STATUS
              <select className="field mt-1" value={form.status || ""} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="filled">filled (occupied)</option><option value="pending">pending</option>
              </select>
            </label>
            <label>BHK<input className="field mt-1" value={form.bhk || ""} onChange={(e) => setForm({ ...form, bhk: e.target.value })} /></label>
            <label>MAINTENANCE ₹<input className="field mt-1" type="number" value={form.maintenance ?? ""} onChange={(e) => setForm({ ...form, maintenance: e.target.value as any })} /></label>
            {hasSqft && <label>SQFT<input className="field mt-1" type="number" value={form.sqft ?? ""} onChange={(e) => setForm({ ...form, sqft: e.target.value as any })} /></label>}
            {"member_since" in f && <>
              <label>MEMBER SINCE<input className="field mt-1" type="date" value={form.member_since || ""} onChange={(e) => setForm({ ...form, member_since: e.target.value })} /></label>
              <label>SHARE CERTIFICATE NO.<input className="field mt-1" value={form.share_cert_no || ""} onChange={(e) => setForm({ ...form, share_cert_no: e.target.value })} /></label>
            </>}
            <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!form.is_committee} onChange={(e) => setForm({ ...form, is_committee: e.target.checked, committee_role: e.target.checked ? form.committee_role || "Committee Member" : null })} /> COMMITTEE MEMBER ★</label>
            {form.is_committee && "committee_role" in f && (() => {
              const preset = COMMITTEE_ROLES.includes(form.committee_role || "");
              const other = !preset && form.committee_role !== undefined && form.committee_role !== null;
              return <>
                <label>DESIGNATION
                  <select className="field mt-1" value={preset ? form.committee_role! : other ? "__other" : "Committee Member"}
                    onChange={(e) => setForm({ ...form, committee_role: e.target.value === "__other" ? "" : e.target.value })}>
                    {COMMITTEE_ROLES.map((r) => <option key={r}>{r}</option>)}
                    <option value="__other">Other…</option>
                  </select>
                </label>
                {other && <label>OTHER DESIGNATION<input className="field mt-1" placeholder="e.g. Joint Secretary" value={form.committee_role || ""} onChange={(e) => setForm({ ...form, committee_role: e.target.value })} /></label>}
              </>;
            })()}
            </>}
            {!isCommittee && <div className="sm:col-span-2 lg:col-span-4 opacity-60 text-[10px]">Charges, BHK, area and status are managed by the committee.</div>}
            <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
              <button onClick={save} disabled={busy === "save"} className="btn-navy px-5 py-2 text-[11px] tracking-[0.1em]">{busy === "save" ? "SAVING…" : "SAVE TO LEDGER"}</button>
              <button onClick={() => setEditing(false)} className="btn-line px-4 py-2 text-[11px]">CANCEL</button>
            </div>
          </div>
        )}

        <div className="mt-6 grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-6">
          <div className="space-y-3">
            {rented && (
              <div className={`border p-4 ${agreementOver ? "border-red-300 bg-red-50" : "border-[var(--gold)] bg-[#fffdf5]"}`}>
                <div className="mono text-[10px] opacity-60">GIVEN ON RENT • TENANT LIVES HERE</div>
                <div className="serif text-[18px] font-bold mt-1">{f.tenant_name || "Tenant name not recorded"}</div>
                <div className="mono text-[10px] mt-1 opacity-70">
                  {f.tenant_from ? `From ${fmtDate(f.tenant_from)}` : "Start date not recorded"} • {f.agreement_until ? `Agreement until ${fmtDate(f.agreement_until)}` : "Agreement end date not recorded"}
                </div>
                {agreementOver && <div className="mono text-[10px] mt-1 text-red-700 font-bold">Rent agreement date has passed. Please upload the renewed agreement below and update the date.</div>}
                <div className="mono text-[10px] mt-1 opacity-60">Keep the rent agreement and police verification in FLAT DOCUMENTS below.</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Box title={rented ? "OWNER • DOES NOT LIVE HERE" : "OWNER"}>
                <div className={`serif text-[18px] font-bold mt-1 ${f.owner_name ? "" : "opacity-40"}`}>{ownerText(f)}</div>
                <div className="mono text-[10px] mt-2 opacity-60 break-all">{f.email ? `Email: ${f.email}` : "Email not recorded"}</div>
                {rented && <div className="mono text-[10px] mt-1 opacity-60 break-words">{[f.owner_mobile && `Mobile: ${f.owner_mobile}`, f.owner_address].filter(Boolean).join(" • ") || "Owner mobile / address not recorded"}</div>}
              </Box>
              <Box title="STATUS">
                <div className={`serif text-[18px] font-bold mt-1 ${isOccupied(f) ? "text-emerald-700" : "text-amber-600"}`}>{statusText(f)}</div>
                <div className="mono text-[11px] mt-2">{isOccupied(f) ? "Ledger active" : "Owner details pending"}</div>
              </Box>
              <Box title="MAINTENANCE">
                <div className="serif text-[22px] font-bold mt-1">{rupees(f.maintenance)}</div>
                <div className="mono text-[10px] mt-1 opacity-70">Per month • Due 5th</div>
                {cat && <div className="mono text-[9px] mt-1 opacity-50">Category: {cat.label} {rupees(cat.maint)}</div>}
              </Box>
              <Box title="BUILT-UP">
                <div className="serif text-[22px] font-bold mt-1">{f.sqft ? `${f.sqft} sqft` : "—"}</div>
                <div className="mono text-[10px] mt-1 opacity-70">{f.bhk || "—"} • {terrace ? "With Terrace - Owner" : "Standard"}</div>
              </Box>
            </div>
            {"member_since" in f && (
              <div className="border border-[var(--border)] p-4 bg-[var(--bg)] grid grid-cols-2 gap-3">
                <div><div className="mono text-[10px] opacity-60">MEMBER SINCE</div><div className="serif text-[16px] font-bold mt-1">{f.member_since ? fmtDate(f.member_since) : <span className="opacity-40 text-[13px]">Not recorded</span>}</div></div>
                <div><div className="mono text-[10px] opacity-60">SHARE CERTIFICATE NO.</div><div className="serif text-[16px] font-bold mt-1">{f.share_cert_no || <span className="opacity-40 text-[13px]">Not recorded</span>}</div></div>
                {!isCommittee && <div className="col-span-2 mono text-[9px] opacity-50">Kept by the committee. Ask them if this needs correcting.</div>}
              </div>
            )}

            <div className="border border-[var(--border)] p-4 bg-[var(--bg-soft)] mono text-[11px] leading-relaxed">
              <div className="font-bold">FLAT DETAILS</div>
              <div className="mt-2 opacity-80">
                {label(f)} is in Tower {f.tower}, Floor {floorOf(f)}. Registered under G-16551. {f.bhk ? `${f.bhk} layout. ` : ""}
                Maintenance {rupees(f.maintenance)} per month. {terrace ? "Terrace ownership applicable - owner holds exclusive terrace rights per agreement in VAULT." : "Terrace ownership not applicable for this floor."}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">TOWER</span><br /><span className="font-bold">Tower {f.tower}</span></div>
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">FLOOR</span><br /><span className="font-bold">Floor {floorOf(f)} • No {unitOf(f)}</span></div>
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">TYPE</span><br /><span className="font-bold">{f.bhk || "—"}</span></div>
                <div className="border border-[var(--border)] bg-white p-2"><span className="opacity-60">CONTACT</span><br /><span className="font-bold break-all">{f.email || "Not on file"}</span></div>
              </div>
            </div>

            <MembersPanel key={`${f.id}-${familyVersion}-${f.occupancy}-${f.tenant_name}`} flatId={f.id} ownerName={rented ? f.tenant_name : f.owner_name} ownerEmail={rented ? null : f.email} tenant={rented} />
            <ConsentCard flat={f} email={ctx.email} isCommittee={isCommittee && f.id !== ctx.homeFlat} onSaved={reloadFlats} />

            {isCommittee && <button onClick={() => { selectFlat(f.id); go("BILLING"); }} className="w-full border border-[var(--border)] bg-[var(--surface)] p-3 mono text-[11px] font-bold text-left hover:border-[var(--gold)]">BILLS, PAYMENTS &amp; RECEIPTS FOR THIS FLAT → open in BILLING</button>}

            <div id="sec-vehicles" className="scroll-mt-28"><FlatListPanel key={`veh-${f.id}-${familyVersion}`} table="vehicles" flatId={f.id} title="VEHICLES" addLabel="+ ADD VEHICLE"
              note={rented ? "Vehicles of the tenant's family living here." : "Vehicles of the family living here."}
              empty="No vehicles added yet."
              fields={[
                { key: "vtype", label: "Vehicle type", options: VEHICLE_TYPES, required: true },
                { key: "model", label: "Model", placeholder: "e.g. Honda Activa, Maruti Swift" },
                { key: "plate", label: "Number plate", placeholder: "GJ 01 AB 1234" },
              ]}
              render={(r) => (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="mono text-[10px] bg-[var(--navy)] text-white px-1.5 py-0.5">{r.vtype}</span>
                  <span className="serif text-[14px] font-bold">{r.model || "Model not given"}</span>
                  {r.plate && <span className="mono text-[12px] font-bold border border-[var(--navy)] bg-white px-2 py-0.5 tracking-[0.06em]">{r.plate}</span>}
                </div>
              )} /></div>

            <FlatListPanel key={`emg-${f.id}-${familyVersion}`} table="emergency_contacts" flatId={f.id} title="EMERGENCY CONTACTS" addLabel="+ ADD CONTACT"
              note="People outside the society to call if something happens. Seen only by this flat and the committee."
              empty="No emergency contact added yet. Please add at least one."
              fields={[
                { key: "name", label: "Name", required: true },
                { key: "relation", label: "Relation", placeholder: "Brother, Son, Friend…" },
                { key: "phone", label: "Phone", required: true },
                { key: "location", label: "Location", placeholder: "City or area" },
              ]}
              render={(r) => (
                <div>
                  <div className="serif text-[14px] font-bold">{r.name}{r.relation && <span className="mono text-[10px] opacity-60 font-normal"> • {r.relation}</span>}</div>
                  <div className="mono text-[11px] mt-0.5"><a href={`tel:${String(r.phone).replace(/\s/g, "")}`} className="underline">{r.phone}</a>{r.location && <span className="opacity-60"> • {r.location}</span>}</div>
                </div>
              )} />

            <div className="border border-amber-300 bg-[#fff8d6] p-4">
              <div className="flex flex-wrap justify-between gap-3 items-center">
                <div>
                  <div className="mono text-[10px] font-bold tracking-[0.14em]">FLAT DOCUMENTS • R2</div>
                  <div className="mono text-[11px] mt-1 opacity-70">Documents the society needs from {label(f)}. Photos and scanned PDFs are compressed before upload (max 4 MB after compressing).</div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                {docTypesReady && <select className="field !w-full sm:!w-[200px] !py-2 mono text-[11px]" value={newDocType} onChange={(e) => setNewDocType(e.target.value)}>
                  <option value="">Which document? *</option>
                  {DOC_TYPES.filter((t) => !t.onlyIfRented || rented).map((t) => <option key={t.key} value={t.name}>{t.name}</option>)}
                  <option value={OTHER}>Other…</option>
                </select>}
                {docTypesReady && newDocType === OTHER && <input className="field !w-[180px] !py-2 mono text-[11px]" placeholder="Type the document name" value={otherDocType} onChange={(e) => setOtherDocType(e.target.value)} />}
                <label className={`btn-navy mono text-[11px] px-4 py-2 cursor-pointer ${docTypesReady && !chosenDocType() ? "opacity-60" : ""}`}
                  onClick={(e) => { if (docTypesReady && !chosenDocType()) { e.preventDefault(); setError("First choose which document it is, then choose the file."); } }}>
                  {busy === "doc" ? "COMPRESSING & UPLOADING…" : "UPLOAD DOCUMENT"}
                  <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" disabled={!!busy} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) uploadDoc(x); }} />
                </label>
                </div>
              </div>
              {docNote && <div className="mt-2 mono text-[11px] text-emerald-700">✓ {docNote}</div>}
              {docTypesReady && (() => {
                const list = docChecklist(docs.map((d) => docTypes[d.key]), rented);
                const missing = list.filter((x) => !x.uploaded).length;
                return (
                  <div className="mt-3 flex flex-wrap gap-1.5 mono text-[10px]" aria-label="Document checklist">
                    {list.map((x) => <span key={x.key} className={`px-2 py-1 border ${x.uploaded ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-white text-amber-800"}`}>{x.uploaded ? "✓" : "○"} {x.name}</span>)}
                    <span className="px-2 py-1 opacity-70">{missing ? `${missing} still to upload` : "All documents uploaded"}</span>
                  </div>);
              })()}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 mono text-[10px]">
                {f.r2_url && <FileLink file={f.r2_url} className="border border-[var(--border)] bg-white p-2 flex justify-between items-center hover:border-[var(--gold)]"><span className="truncate">Earlier document</span><span>↗</span></FileLink>}
                {docs.map((d) => (
                  <div key={d.key} className="border border-[var(--border)] bg-white p-2 hover:border-[var(--gold)]">
                    {editDocKey === d.key ? (
                      <div className="flex gap-2 items-center">
                        <input autoFocus list="aakar-doc-types" className="field !py-1 !text-[11px]" value={editDocType} onChange={(e) => setEditDocType(e.target.value)} placeholder="Document type" />
                        <datalist id="aakar-doc-types">{DOC_TYPES.map((t) => <option key={t.key} value={t.name} />)}</datalist>
                        <button onClick={() => saveDocType(d.key)} className="btn-navy px-2 py-1">SAVE</button>
                        <button onClick={() => setEditDocKey(null)} className="underline">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          {docTypesReady && <div className={`font-bold text-[11px] ${docTypes[d.key] ? "text-[var(--navy)]" : "text-amber-700"}`}>{docTypes[d.key] || "Type not set"}</div>}
                          <FileLink file={d.key} className="block truncate hover:underline">{d.name}</FileLink>
                          <div className="opacity-50">{fmtDate(d.uploaded)} • {fmtSize(d.size)}</div>
                        </div>
                        <span className="flex items-center gap-2 shrink-0">
                          {docTypesReady && <button onClick={() => { setEditDocKey(d.key); setEditDocType(docTypes[d.key] || ""); }} className="underline">Edit type</button>}
                          <button onClick={() => removeDoc(d)} className="text-red-600">✕</button>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                {!f.r2_url && docs.length === 0 && <div className="opacity-60">No documents uploaded for this flat yet.</div>}
              </div>
            </div>
          </div>

          <div className="border border-[var(--border)] rounded-[3px] overflow-hidden self-start">
            {isCommittee && <><div className="bg-[var(--navy)] text-white mono text-[10px] tracking-[0.16em] p-3">OTHER FLATS • TOWER {f.tower}</div>
            <div className="divide-y divide-[var(--border)] max-h-[380px] overflow-auto">
              {flats.filter((m) => m.tower === f.tower).map((m) => (
                <button key={m.id} onClick={() => selectFlat(m.id)} className={`w-full text-left p-3 flex justify-between gap-2 mono text-[11px] hover:bg-[var(--bg)] ${m.id === f.id ? "bg-amber-50" : "bg-[var(--surface)]"}`}>
                  <span className="truncate">{label(m)} • {m.owner_name || "—"}</span><span className="opacity-60 shrink-0">{rupees(m.maintenance)}</span>
                </button>
              ))}
            </div></>}
            <div className="p-3 bg-[var(--bg-soft)] border-t border-[var(--border)] mono text-[10px]">
              <div className="font-bold tracking-[0.12em]">QUICK ACTIONS</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => go("VAULT")} className="btn-navy px-2 py-1">OPEN VAULT 🔒</button>
                {isCommittee && <button onClick={() => go("ADMIN")} className="btn-line px-2 py-1">CHARGES</button>}
                <button onClick={() => go("BUSINESS")} className="btn-line px-2 py-1">BUSINESS</button>
              </div>
              <div className="mt-3 space-y-1">
                {vaultDocs.slice(0, 3).map((s) => (
                  <FileLink key={s.id} file={s.file!.key} className="flex justify-between border border-[var(--border)] bg-white p-2 hover:border-[var(--gold)]"><span className="truncate">{s.name}</span><span>↗</span></FileLink>
                ))}
                {vaultDocs.length === 0 && <div className="opacity-50">No vault documents uploaded yet.</div>}
              </div>
            </div>
          </div>
        </div>
        {!isCommittee && <div id="sec-ledger" className="mt-6 scroll-mt-28"><MyBills flat={f} flats={flats} email={ctx.email} /></div>}
        <div id="sec-letters" className="mt-6 scroll-mt-28"><LettersPanel flat={f} flats={flats} isCommittee={isCommittee} email={ctx.email} /></div>
        {!isCommittee && <div id="sec-contacts" className="scroll-mt-28">{contacts.length > 0 && <WhoToContact flats={flats} isCommittee={false} areas={contacts} className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-5" />}</div>}
      </div>
    </div>
  );
}
