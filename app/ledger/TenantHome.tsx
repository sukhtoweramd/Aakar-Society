"use client";
// MY FLAT for a TENANT login (TENANT_LOGINS.sql, 30 Oct 2026). The tenant manages the family, vehicles and emergency
// contacts of the rented flat, raises complaints and books the common plot. Owner matters (bills, ledger, documents,
// nominees, letters) are not shown and the database does not give them to this login.
import { useEffect, useState } from "react";
import { label } from "@/lib/society";
import { supabase } from "@/lib/supabaseClient";
import { loadAreas, type Area } from "@/lib/committee";
import MembersPanel from "./MembersPanel";
import ComplaintsPanel from "./ComplaintsPanel";
import BookingPanel from "./BookingPanel";
import WhoToContact from "./WhoToContact";
import { EmergencyPanel, VehiclesPanel } from "./flatLists";
import type { Ctx } from "./ctx";
import type { Section } from "@/lib/phoneMenu";
import { PhoneSection } from "./PhoneHome";

export default function TenantHome({ ctx, only }: { ctx: Ctx; only?: Section | null }) {
  const flatId = ctx.tenantFlat || "";
  const f = ctx.flats.find((x) => x.id === flatId) || null;
  const [areas, setAreas] = useState<Area[]>([]);
  const [active, setActive] = useState<boolean | null>(null);   // the database says whether this tenant login still works
  useEffect(() => {
    loadAreas().then((a) => setAreas((a || []).filter((x) => x.holder_flat)));
    supabase.rpc("my_tenant_flat").then(({ data, error }) => setActive(!error && !!data));
  }, []);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (active === false) return (
    <div className="border border-amber-300 bg-amber-50 p-6 mono text-[12px] space-y-3">
      <div className="serif text-[18px] font-bold">This tenant login is switched off</div>
      <div>The flat is no longer marked as rented to you, or the committee has switched this login off. Please contact the committee.</div>
      <button onClick={() => supabase.auth.signOut()} className="btn-navy px-4 min-h-[44px]">LOG OUT</button>
    </div>);
  if (!flatId) return <div className="border border-dashed border-[var(--border)] p-6 mono text-[12px]">This tenant login is not linked to a flat. Please ask the committee.</div>;

  // Phone: one function on its own screen, opened from the phone home screen (30 Oct 2026).
  if (only) {
    const one: Partial<Record<Section, [React.ReactNode, string]>> = {
      family: [<MembersPanel key="m" flatId={flatId} ownerName={f?.tenant_name || null} ownerEmail={null} tenant lockHead />, ""],
      vehicles: [<VehiclesPanel key="v" flatId={flatId} rented />, ""],
      emergency: [<EmergencyPanel key="e" flatId={flatId} />, ""],
      complaints: [<ComplaintsPanel key="c" mode="flat" flats={ctx.flats} flatId={flatId} isCommittee={false} />, "Complaints are not switched on yet."],
      booking: [<BookingPanel key="b" mode="flat" flats={ctx.flats} flatId={flatId} isCommittee={false} />, "Bookings are not switched on yet."],
      contacts: [areas.length > 0 ? <div key="w" className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4"><WhoToContact flats={ctx.flats} isCommittee={false} areas={areas} /></div> : null, "The committee has not set up who to contact yet."],
    };
    const [body, empty] = one[only] || [null, "This is not available for a tenant login."];
    return <div className="fade-in min-w-0"><PhoneSection key={only} empty={empty}>{body}</PhoneSection></div>;
  }

  return (
    <div className="space-y-4 fade-in min-w-0">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 md:p-6">
        <div className="mono text-[10px] tracking-[0.16em] opacity-60">TENANT • MY FLAT</div>
        <div className="serif text-[34px] md:text-[44px] font-[800] leading-none mt-1">{f ? label(f) : flatId}</div>
        <div className="mono text-[12px] mt-2 opacity-80">{f?.tenant_name ? `${f.tenant_name} • ` : ""}Tower {f?.tower || flatId[0]}</div>
        <div className="mono text-[11px] mt-2 opacity-60 max-w-[640px]">This is the tenant's login for this flat. Bills, receipts and the flat's documents are handled by the owner and the committee.</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[["sec-family", "FAMILY ↓"], ["sec-vehicles", "VEHICLES ↓"], ["sec-emergency", "EMERGENCY ↓"], ["sec-complaints", "COMPLAINTS ↓"], ["sec-booking", "BOOK COMMON PLOT ↓"]].map(([id, t]) => (
            <button key={id} onClick={() => jump(id)} className="btn-line mono text-[11px] px-3 min-h-[44px] font-bold">{t}</button>))}
          <button onClick={() => ctx.go("CONTACTS")} className="btn-navy mono text-[11px] px-3 min-h-[44px]">IMPORTANT CONTACTS</button>
        </div>
      </div>

      <div id="sec-family" className="scroll-mt-28">
        <MembersPanel flatId={flatId} ownerName={f?.tenant_name || null} ownerEmail={null} tenant lockHead />
      </div>
      <div id="sec-vehicles" className="scroll-mt-28"><VehiclesPanel flatId={flatId} rented /></div>
      <div id="sec-emergency" className="scroll-mt-28"><EmergencyPanel flatId={flatId} /></div>
      <div id="sec-complaints" className="scroll-mt-28"><ComplaintsPanel mode="flat" flats={ctx.flats} flatId={flatId} isCommittee={false} /></div>
      <div id="sec-booking" className="scroll-mt-28"><BookingPanel mode="flat" flats={ctx.flats} flatId={flatId} isCommittee={false} /></div>
      {areas.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[4px] p-4 md:p-5">
          <WhoToContact flats={ctx.flats} isCommittee={false} areas={areas} />
        </div>
      )}
    </div>
  );
}
