"use client";
// Vehicles and emergency contacts of a flat: used on MY FLAT (owner / committee) and on the tenant's screen.
import FlatListPanel, { VEHICLE_TYPES } from "./FlatListPanel";

export function VehiclesPanel({ flatId, rented, readOnly = false }: { flatId: string; rented: boolean; readOnly?: boolean }) {
  return (
    <FlatListPanel readOnly={readOnly} table="vehicles" flatId={flatId} title="VEHICLES" addLabel="+ ADD VEHICLE"
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
      )} />
  );
}

export function EmergencyPanel({ flatId, readOnly = false }: { flatId: string; readOnly?: boolean }) {
  return (
    <FlatListPanel readOnly={readOnly} table="emergency_contacts" flatId={flatId} title="EMERGENCY CONTACTS" addLabel="+ ADD CONTACT"
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
  );
}
