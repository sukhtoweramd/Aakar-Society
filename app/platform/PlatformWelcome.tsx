// Welcome block above the product owner sign-in: logo, name, tagline, a short line about the product and what it covers.
// Brand colours (teal / green / amber) are used here only; the rest of the app keeps its own look. Phone first: one column, two on wider screens.
import GrihSaharaLogo from "./GrihSaharaLogo";

export const PLATFORM_HIGHLIGHTS: { title: string; text: string }[] = [
  { title: "Bills & payments", text: "Maintenance bills, receipts and “I have paid” reports." },
  { title: "Letters & approvals", text: "Member requests, committee approval, a register of letters." },
  { title: "Complaints & booking", text: "Complaints to the right member; common plot booking." },
  { title: "Events & notices", text: "Registration, passes, gate scan, notices and birthdays." },
  { title: "Committee & meetings", text: "Roles, areas, AMC contracts, minutes and action points." },
  { title: "Private per society", text: "Each society has its own space; no one sees another society's data." },
];

export default function PlatformWelcome() {
  return (
    <div className="max-w-[420px] mx-auto space-y-4" data-testid="platform-welcome">
      <div className="rounded-[14px] text-white px-5 py-6 text-center" style={{ background: "linear-gradient(135deg,#2cc08f 0%,#0e7c86 100%)" }}>
        <div className="flex justify-center"><div className="rounded-[22px] bg-white/15 p-2"><GrihSaharaLogo size={72} /></div></div>
        <h1 className="serif text-[30px] mt-3">GrihSahara</h1>
        <div className="text-[18px] opacity-95" lang="hi">गृहसहारा</div>
        <div className="mono text-[14px] font-semibold mt-1">Smarter Community Living</div>
        <div className="mono text-[10px] tracking-[0.18em] uppercase opacity-85 mt-1">Housing Society Operations Platform</div>
      </div>

      <div>
        <div className="serif text-[18px]">Welcome to GrihSahara</div>
        <p className="mono text-[13px] opacity-80 mt-1">GrihSahara is a SaaS (software as a service) platform for housing societies. Each society gets its own private space on one shared cloud service: nothing to install on a server and no upgrades to manage. The committee runs the society's work from it, and members use it from their phones.</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {["Cloud based", "One service, many societies", "Updated centrally", "Made for phones"].map((t) => <span key={t} className="mono text-[10px] font-semibold border border-[#0e7c86] text-[#0e7c86] rounded-full px-2.5 py-1">{t}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PLATFORM_HIGHLIGHTS.map((h, i) => (
          <div key={h.title} className="min-w-0 bg-[var(--surface)] border border-[var(--border)] border-t-[3px] px-3 py-2" style={{ borderTopColor: ["#1f9d74", "#4457c7", "#d1456b", "#f2a93b", "#7a4fc2", "#0e7c86"][i % 6] }}>
            <div className="mono text-[12px] font-bold">{h.title}</div>
            <div className="mono text-[11px] opacity-70 mt-0.5">{h.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
