"use client";
// MY FLAT → NOMINEE (item 22): the owner names one or more nominees with a share %. Phone first: one card per nominee.
// The committee can do the same for any flat. Since sql-security/11 (30 Oct 2026) the owner of a rented flat also uses this
// from the flat login; a tenant's own login never sees nominees. The committee
// ticks "signed form received" when the paper form reaches the society.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dmy, docPage, openPrint } from "@/lib/billing";
import { label, ownerText, type Flat } from "@/lib/society";
import { aadhaarLast4, ageOn, cleanPan, isMinor, maskedAadhaar, nomineeProblems, RELATIONS, shareTotal, type Draft, type Nominee, type NominationStatus } from "@/lib/nominees";

const blank = (share: number): Draft => ({ name: "", relation: "", dob: "", aadhaar: "", pan: "", share_pct: String(share), mobile: "", address: "", guardian_name: "", guardian_relation: "" });
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const missing = (m: string) => /nominees|nomination_status|schema cache|does not exist/i.test(m);

export default function NomineePanel({ flat, isCommittee, email }: { flat: Flat; isCommittee: boolean; email: string }) {
  const [list, setList] = useState<Nominee[] | null | undefined>(undefined);
  const [status, setStatus] = useState<NominationStatus | null>(null);
  const [edit, setEdit] = useState<{ id?: string; d: Draft } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function load() {
    const [n, s] = await Promise.all([
      supabase.from("nominees").select("*").eq("flat_id", flat.id).order("sort").order("created_at"),
      supabase.from("nomination_status").select("*").eq("flat_id", flat.id).maybeSingle(),
    ]);
    if (n.error) { setList(missing(n.error.message) ? null : []); return; }
    setList((n.data as Nominee[]) || []); setStatus((s.data as NominationStatus) || null);
  }
  useEffect(() => { setEdit(null); load(); }, [flat.id]);

  if (list === undefined) return null;
  if (list === null) return isCommittee ? <Box><div className="mono text-[12px] opacity-80">Run <b>NOMINEES.sql</b> in Supabase to turn on the nominee form.</div></Box> : null;

  const total = shareTotal(list);
  const remaining = Math.max(0, Math.round((100 - total) * 100) / 100);

  async function save() {
    if (!edit) return;
    const probs = nomineeProblems(edit.d);
    const others = list!.filter((x) => x.id !== edit.id);
    if (shareTotal(others) + Number(edit.d.share_pct) > 100.001) probs.push(`Shares add up to more than 100% (others already have ${shareTotal(others)}%)`);
    if (probs.length) { setErr(`Please check: ${probs.join(" • ")}`); return; }
    setBusy(true); setErr("");
    const d = edit.d; const minor = isMinor(d.dob);
    const row = { flat_id: flat.id, name: d.name.trim(), relation: d.relation.trim(), dob: d.dob, aadhaar_last4: aadhaarLast4(d.aadhaar) || null, pan: cleanPan(d.pan) || null,
      share_pct: Number(d.share_pct), mobile: d.mobile.trim() || null, address: d.address.trim() || null,
      guardian_name: minor ? d.guardian_name.trim() || null : null, guardian_relation: minor ? d.guardian_relation.trim() || null : null,
      updated_by: email, updated_at: new Date().toISOString(), sort: edit.id ? undefined : list!.length + 1 };
    const res = edit.id ? await supabase.from("nominees").update(row).eq("id", edit.id) : await supabase.from("nominees").insert(row);
    setBusy(false);
    if (res.error) { setErr(res.error.message); return; }
    setEdit(null); load();
  }
  async function remove(n: Nominee) {
    if (!confirm(`Remove ${n.name} as nominee?`)) return;
    const { error } = await supabase.from("nominees").delete().eq("id", n.id);
    if (error) setErr(error.message); else load();
  }
  async function markReceived(v: boolean) {
    const { error } = await supabase.from("nomination_status").upsert({ flat_id: flat.id, form_received: v, received_at: v ? new Date().toISOString() : null, received_by: v ? email : null, updated_at: new Date().toISOString() });
    if (error) setErr(error.message); else load();
  }
  function print() {
    const w = window.open("", "_blank");
    const rows = list!.map((n, i) => `<tr><td>${i + 1}</td><td><b>${esc(n.name)}</b>${n.address ? `<div style="font-size:8.5pt;color:#555">${esc(n.address)}</div>` : ""}${n.mobile ? `<div style="font-size:8.5pt">Mob. ${esc(n.mobile)}</div>` : ""}</td><td>${esc(n.relation)}</td>
      <td>${esc(dmy(n.dob))}<div style="font-size:8.5pt;color:#555">age ${ageOn(n.dob)}</div></td><td style="white-space:nowrap">____ ____ ${esc(n.aadhaar_last4 || "____")}</td><td>${esc(n.pan || "")}</td><td style="text-align:right"><b>${esc(n.share_pct)}%</b></td></tr>
      ${n.guardian_name ? `<tr><td></td><td colspan="6" style="font-size:9pt">Nominee is a minor. Guardian: <b>${esc(n.guardian_name)}</b>${n.guardian_relation ? ` (${esc(n.guardian_relation)})` : ""}</td></tr>` : ""}`).join("");
    const th = "background:var(--navy);color:#fff;text-align:left;padding:1.5mm 2mm;font-size:9pt";
    const inner = `
      <div style="margin-top:5mm;font-size:10.5pt;line-height:1.7">
        I, <b>${esc(status?.member_name || ownerText(flat) || "______________________")}</b>, a member of ${esc("Aakar Co-op Housing Society Ltd.")}, holding flat <b>${esc(label(flat))}</b>${flat.share_cert_no ? ` and share certificate no. <b>${esc(flat.share_cert_no)}</b>` : " and share certificate no. ________"},
        hereby nominate the person(s) named below to whom my share(s) and interest in the property of the society shall be transferred after my death, in the proportion shown.
        This cancels any nomination made by me earlier.
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:4mm;font-size:10pt" border="1" cellpadding="6">
        <tr><th style="${th}">#</th><th style="${th}">Nominee (name, address, mobile)</th><th style="${th}">Relation</th><th style="${th}">Date of birth</th><th style="${th}">Aadhaar</th><th style="${th}">PAN</th><th style="${th}">Share</th></tr>${rows}
        <tr><td colspan="6" style="text-align:right">Total</td><td style="text-align:right"><b>${total}%</b></td></tr>
      </table>
      <div style="font-size:8.5pt;color:#555;margin-top:2mm">Aadhaar: the society's app keeps only the last 4 digits. Please write the first 8 digits by hand above if the society asks for the full number.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:14mm;font-size:10pt">
        <div><div style="border-top:.3mm solid var(--ink);padding-top:1mm">Signature of member</div><div style="margin-top:2mm">Place: Ahmedabad &nbsp; Date: ____________</div></div>
        <div><div style="border-top:.3mm solid var(--ink);padding-top:1mm">Witness 1 (name, address, signature)</div><div style="border-top:.3mm solid var(--ink);padding-top:1mm;margin-top:12mm">Witness 2 (name, address, signature)</div></div>
      </div>
      <div style="margin-top:10mm;border:.3mm dashed var(--line);padding:3mm;font-size:9.5pt">FOR SOCIETY USE • Nomination received on ____________ • Recorded by ____________ • Committee meeting dated ____________</div>`;
    openPrint(`Nomination ${label(flat)}`, [docPage("NOMINATION", label(flat), `Flat <b>${esc(label(flat))}</b>`, inner, "Nomination form • please check the wording against the society's bye-laws", `Printed ${dmy(new Date().toISOString().slice(0, 10))}`)], w);
  }

  const field = (k: keyof Draft, lab: string, props: any = {}) => (
    <label className="block"><span className="mono text-[11px] font-bold">{lab}</span>
      <input className="field mt-1" value={edit!.d[k]} onChange={(e) => setEdit({ ...edit!, d: { ...edit!.d, [k]: e.target.value } })} {...props} /></label>);

  return (
    <Box>
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>
          <div className="mono text-[11px] font-bold tracking-[0.16em]">NOMINEE</div>
          <div className="mono text-[11px] opacity-60">Who the flat's share and interest go to. Seen only by this flat's owner and the committee.</div>
        </div>
        {list.length > 0 && <button onClick={() => (total === 100 ? print() : setErr("Shares must add up to 100% before printing the form."))} className={`btn-navy px-4 py-2.5 mono text-[11px] ${total === 100 ? "" : "opacity-50"}`}>PRINT FORM TO SIGN</button>}
      </div>

      {status && list.length > 0 && (
        <div className={`mt-3 p-2.5 mono text-[11px] border ${status.form_received ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          {status.form_received ? `✓ Signed form received by the society${status.received_at ? ` on ${dmy(status.received_at.slice(0, 10))}` : ""}.` : "Print the form, sign it with two witnesses, and give it to the society office."}
          {isCommittee && <button onClick={() => markReceived(!status.form_received)} className="ml-2 underline font-bold">{status.form_received ? "undo" : "Mark signed form received"}</button>}
        </div>)}

      <div className="mt-3 grid gap-2">
        {list.map((n) => (
          <div key={n.id} className="border border-[var(--border)] bg-white p-3 mono text-[12px]">
            <div className="flex justify-between gap-2"><b className="text-[13px]">{n.name}</b><b className="text-[var(--navy)]">{n.share_pct}%</b></div>
            <div className="opacity-80 mt-0.5">{n.relation} • born {dmy(n.dob)} (age {ageOn(n.dob)})</div>
            <div className="opacity-80">Aadhaar {maskedAadhaar(n.aadhaar_last4)} • PAN {n.pan || "—"}</div>
            {(n.mobile || n.address) && <div className="opacity-70 text-[11px]">{[n.mobile, n.address].filter(Boolean).join(" • ")}</div>}
            {n.guardian_name && <div className="text-amber-800 text-[11px]">Minor • guardian {n.guardian_name}{n.guardian_relation ? ` (${n.guardian_relation})` : ""}</div>}
            {!edit && <div className="mt-2 flex gap-2"><button onClick={() => setEdit({ id: n.id, d: { name: n.name, relation: n.relation, dob: n.dob, aadhaar: n.aadhaar_last4 || "", pan: n.pan || "", share_pct: String(n.share_pct), mobile: n.mobile || "", address: n.address || "", guardian_name: n.guardian_name || "", guardian_relation: n.guardian_relation || "" } })} className="btn-line px-3 py-2">EDIT</button>
              <button onClick={() => remove(n)} className="btn-line px-3 py-2 text-red-700">REMOVE</button></div>}
          </div>))}
        {list.length > 0 && <div className={`mono text-[11px] ${total === 100 ? "text-emerald-700" : "text-red-700 font-bold"}`}>Total share {total}%{total !== 100 ? ` — must be 100% (${remaining}% not given yet)` : " ✓"}</div>}
        {list.length === 0 && !edit && <div className="mono text-[12px] opacity-70">No nominee recorded yet.</div>}
      </div>

      {!edit ? (remaining > 0 && <button onClick={() => { setErr(""); setEdit({ d: blank(remaining) }); }} className="btn-gold w-full sm:w-auto mt-3 px-5 py-3 mono text-[12px]">+ ADD NOMINEE</button>) : (
        <div className="mt-3 border border-[var(--gold)] bg-[#fffdf5] p-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "NOMINEE'S FULL NAME *", { autoComplete: "off" })}</div>
          <label className="block"><span className="mono text-[11px] font-bold">RELATION *</span>
            <input className="field mt-1" list="nominee-relations" value={edit.d.relation} onChange={(e) => setEdit({ ...edit, d: { ...edit.d, relation: e.target.value } })} />
            <datalist id="nominee-relations">{RELATIONS.map((r) => <option key={r} value={r} />)}</datalist></label>
          {field("dob", "DATE OF BIRTH *", { type: "date", max: new Date().toISOString().slice(0, 10) })}
          {field("aadhaar", "AADHAAR – LAST 4 DIGITS", { inputMode: "numeric", maxLength: 14, placeholder: "e.g. 1234", onBlur: () => setEdit((x) => x && { ...x, d: { ...x.d, aadhaar: aadhaarLast4(x.d.aadhaar) } }) })}
          {field("pan", "PAN", { maxLength: 10, placeholder: "ABCDE1234F", style: { textTransform: "uppercase" } })}
          {field("share_pct", "SHARE % *", { inputMode: "decimal" })}
          {field("mobile", "MOBILE", { inputMode: "tel" })}
          <div className="sm:col-span-2">{field("address", "ADDRESS (if not living here)")}</div>
          {edit.d.dob && isMinor(edit.d.dob) && <>
            <div className="sm:col-span-2 mono text-[11px] text-amber-800 font-bold">Nominee is under 18 — a guardian is needed.</div>
            {field("guardian_name", "GUARDIAN'S NAME *")}
            {field("guardian_relation", "GUARDIAN'S RELATION TO NOMINEE")}
          </>}
          <div className="sm:col-span-2 mono text-[10.5px] opacity-70">Only the last 4 digits of Aadhaar are kept in the app. If you type the full number, the app keeps just the last 4.</div>
          {err && <div className="sm:col-span-2 text-red-700 mono text-[12px]">{err}</div>}
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={save} disabled={busy} className="btn-navy flex-1 sm:flex-none px-5 py-3 font-bold mono text-[12px]">{busy ? "SAVING…" : "SAVE NOMINEE"}</button>
            <button onClick={() => { setEdit(null); setErr(""); }} className="btn-line px-4 py-3 mono text-[12px]">CANCEL</button>
          </div>
        </div>)}
      {err && !edit && <div className="mt-2 text-red-700 mono text-[12px]">{err}</div>}
    </Box>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div id="sec-nominee" className="scroll-mt-28 border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 mt-4">{children}</div>;
}
