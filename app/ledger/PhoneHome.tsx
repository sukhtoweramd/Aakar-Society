"use client";
// Phone home screen (30 Oct 2026): instead of tabs and a long page, phones show one screen of buttons. Each button opens
// one function on its own screen; the HOME bar (and the phone's back button) brings the buttons back. Desktop is unchanged.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { label, SOCIETY } from "@/lib/society";
import { dmy, flatTotals, inr, type Bill, type Payment } from "@/lib/billing";
import { committeeMenu, memberMenu, tenantMenu, type Tile } from "@/lib/phoneMenu";
import type { Ctx, Tab } from "./ctx";

/** true on screens narrower than 768 px (phones); updates when the phone is turned. */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

const ICON: Record<string, string> = {
  bill: "M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h4",
  family: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6 M15.5 14.5c3 0 5.5 2 5.5 5.5",
  car: "M4 16v-4l2-5h12l2 5v4z M4 12h16 M7.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  folder: "M3 6h6l2 2h10v11H3z",
  mail: "M3 5h18v14H3z M3 6l9 7 9-7",
  alert: "M12 3l10 18H2z M12 10v5 M12 18v.5",
  calendar: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1-4 4-6 8-6s7 2 8 6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  headset: "M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v6H4z M17 14h3v6h-3z",
  card: "M3 5h18v14H3z M9 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M14 10h4 M14 14h4 M6 16.5c.5-1.5 1.7-2.3 3-2.3s2.5.8 3 2.3",
  check: "M10 6h10 M10 12h10 M10 18h10 M4 6l1 1 2-2 M4 12l1 1 2-2 M4 18l1 1 2-2",
  notice: "M4 10v4l12 5V5z M16 9a3 3 0 0 1 0 6",
  ticket: "M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z",
  book: "M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z M9 8h6",
  list: "M4 6h16 M4 12h16 M4 18h10",
  briefcase: "M3 8h18v12H3z M9 8V5h6v3 M3 13h18",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  building: "M5 21V4h9v17 M14 9h5v12 M8 8h3 M8 12h3 M8 16h3 M3 21h18",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  people: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20c0-3 2.5-5 6-5s6 2 6 5 M14 15c3.5 0 8 1.5 8 5",
  chart: "M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  home: "M3 11l9-8 9 8 M5 9v12h14V9",
};
export function Icon({ name, className = "h-7 w-7" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name] || ICON.home} />
    </svg>
  );
}

function TileGrid({ tiles, cols, onOpen, small }: { tiles: Tile[]; cols: 3 | 4; onOpen: (t: Tile) => void; small?: boolean }) {
  if (!tiles.length) return null;
  return (
    <div className={`grid gap-2 ${cols === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
      {tiles.map((t) => (
        <button key={t.key} type="button" onClick={() => onOpen(t)}
          className={`min-w-0 bg-[var(--surface)] border border-[var(--border)] active:border-[var(--gold)] active:bg-[var(--bg-soft)] flex flex-col items-center justify-center text-center text-[var(--navy)] font-bold tracking-[0.04em] leading-tight px-1 ${small ? "min-h-[66px] gap-1.5 text-[9.5px]" : "min-h-[84px] gap-2 text-[10.5px]"}`}>
          <Icon name={t.icon} className={small ? "h-[22px] w-[22px]" : "h-[26px] w-[26px]"} />
          <span className="break-words">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The member's dues for the top card: total still due, and the latest bill with something left to pay. */
function useDues(flatId: string | null) {
  const [d, setD] = useState<{ due: number; bill: Bill | null } | null>(null);
  useEffect(() => {
    if (!flatId) return;
    (async () => {
      const [b, p] = await Promise.all([supabase.from("bills").select("*").eq("flat_id", flatId), supabase.from("payments").select("*").eq("flat_id", flatId)]);
      if (b.error || p.error) return;
      const bills = ((b.data as Bill[]) || []).filter((x) => x.status === "active"), pays = (p.data as Payment[]) || [];
      if (!bills.length) return;
      const paid = (id: string) => pays.filter((x) => x.bill_id === id && x.status === "active").reduce((n, x) => n + Number(x.amount || 0), 0);
      const open = bills.filter((x) => Number(x.amount) - paid(x.id) > 0.001).sort((a, z) => z.bill_date.localeCompare(a.bill_date));
      setD({ due: flatTotals(bills, pays).due, bill: open[0] || null });
    })();
  }, [flatId]);
  return d;
}

function useOpenActions(on: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    supabase.rpc("my_action_points").then(({ data, error }) => { if (!error) setN(((data as any[]) || []).filter((r) => r.status === "open").length); });
  }, [on]);
  return n;
}

const Head = ({ children }: { children: React.ReactNode }) => <div className="mono text-[10px] font-bold tracking-[0.16em] text-[#8a6d1e]">{children}</div>;

export default function PhoneHome({ ctx, allowed, onOpen }: { ctx: Ctx; allowed: Tab[]; onOpen: (t: Tile) => void }) {
  const { isCommittee, isTenant, myFlat, tenantFlat, homeFlat, flats } = ctx;
  const flatId = isTenant ? tenantFlat || null : myFlat;
  const f = flats.find((x) => x.id === flatId) || null;
  const dues = useDues(!isCommittee && !isTenant ? myFlat : null);
  const actions = useOpenActions(!isTenant && (!isCommittee || !!homeFlat));

  if (isCommittee) {
    const m = committeeMenu({ homeFlat: !!homeFlat });
    return (
      <div className="space-y-3 fade-in">
        <div className="bg-[var(--surface)] border border-[var(--border)] border-t-[3px] border-t-[var(--gold)] p-4">
          <Head>COMMITTEE</Head>
          <div className="serif text-[22px] font-bold leading-tight mt-1">{SOCIETY.building}</div>
          <div className="mono text-[11px] opacity-70 mt-1 break-all">{ctx.email}{homeFlat ? ` • Flat ${label({ id: homeFlat, flat_no: homeFlat } as any)}` : ""}</div>
        </div>
        <TileGrid tiles={m.work} cols={3} onOpen={onOpen} />
        {actions > 0 && homeFlat && <button type="button" onClick={() => onOpen({ key: "actions", label: "ACTION POINTS", icon: "check", section: "actions" })} className="w-full min-h-[44px] border-2 border-[var(--gold)] bg-[#fffdf5] mono text-[12px] font-bold">MY ACTION POINTS • {actions} OPEN</button>}
        <Head>SOCIETY</Head>
        <TileGrid tiles={m.society} cols={4} onOpen={onOpen} small />
      </div>
    );
  }

  const m = isTenant ? tenantMenu({ allowed }) : memberMenu({ rented: f?.occupancy === "tenant", allowed, openActions: actions });
  return (
    <div className="space-y-3 fade-in">
      <div className="flex justify-between items-end gap-3">
        <div className="min-w-0">
          <Head>{isTenant ? "TENANT • MY FLAT" : "MY FLAT"}</Head>
          <div className="serif text-[34px] font-[800] leading-none mt-1 text-[var(--navy)]">{f ? label(f) : flatId || "—"}</div>
        </div>
        <div className="mono text-[11px] text-right opacity-75 leading-snug min-w-0">
          <div className="truncate max-w-[180px]">{isTenant ? f?.tenant_name || "Tenant" : f?.owner_name || "Owner"}</div>
          <div>{f ? `Tower ${f.tower} • Floor ${f.floor ?? "—"}` : ""}</div>
        </div>
      </div>
      {!isTenant && dues && (
        <div className="bg-[var(--navy)] text-white p-4 border-t-[3px] border-[var(--gold)] space-y-3">
          <div className="flex justify-between items-end gap-3">
            <div>
              <div className="mono text-[10px] font-bold tracking-[0.16em] text-[var(--gold)]">{dues.due > 0 ? "OUTSTANDING" : "DUES"}</div>
              <div className="serif text-[28px] font-[800] leading-tight">{dues.due > 0 ? `₹${inr(dues.due)}` : "Nothing due"}</div>
            </div>
            {dues.bill && <div className="mono text-[11px] text-right opacity-80 leading-snug">{dues.bill.period_from ? `${dmy(dues.bill.period_from)} – ${dmy(dues.bill.period_to)}` : dues.bill.bill_no}{dues.bill.due_date ? <><br />Due {dmy(dues.bill.due_date)}</> : null}</div>}
          </div>
          <div className="flex gap-2">
            {dues.due > 0 && <button type="button" onClick={() => onOpen({ key: "bills", label: "", icon: "bill", section: "bills" })} className="flex-1 min-h-[44px] bg-[var(--gold)] text-[var(--navy)] mono text-[12px] font-bold tracking-[0.06em]">I HAVE PAID</button>}
            <button type="button" onClick={() => onOpen({ key: "bills", label: "", icon: "bill", section: "bills" })} className="flex-1 min-h-[44px] border border-white mono text-[12px] font-bold tracking-[0.06em]">{dues.due > 0 ? "VIEW BILL" : "MY LEDGER"}</button>
          </div>
        </div>
      )}
      <TileGrid tiles={m.flat} cols={3} onOpen={onOpen} />
      {m.society.length > 0 && <><Head>SOCIETY</Head><TileGrid tiles={m.society} cols={4} onOpen={onOpen} small /></>}
      {isTenant && <div className="bg-[var(--bg-soft)] border border-[var(--border)] p-3 mono text-[11px] leading-relaxed">Maintenance bills, receipts and the flat&apos;s ownership documents are with the owner&apos;s login.</div>}
    </div>
  );
}

/** Top bar of a function opened from the phone home screen. */
export function PhoneBar({ title, sub, onHome }: { title: string; sub?: string; onHome: () => void }) {
  return (
    <div className="sticky top-0 z-30 bg-[var(--navy)] text-white px-3 py-2 flex items-center gap-3">
      <button type="button" onClick={onHome} className="min-h-[44px] px-3 bg-[var(--gold)] text-[var(--navy)] mono text-[12px] font-bold tracking-[0.06em] flex items-center gap-1.5 shrink-0">
        <Icon name="home" className="h-5 w-5" />HOME
      </button>
      <div className="min-w-0">
        {sub && <div className="mono text-[10px] font-bold tracking-[0.14em] text-[var(--gold)] truncate">{sub}</div>}
        <div className="serif text-[17px] font-bold leading-tight truncate">{title}</div>
      </div>
    </div>
  );
}

/** One section opened from the phone home screen; shows a note when the section has nothing to show yet. */
export function PhoneSection({ empty, children }: { empty: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIsEmpty(!!ref.current && ref.current.offsetHeight < 8), 2500);
    return () => clearTimeout(t);
  }, []);
  return (<div className="space-y-4 min-w-0">
    <div ref={ref} className="min-w-0">{children}</div>
    {isEmpty && empty && <div className="border border-[var(--border)] bg-[var(--bg-soft)] p-4 mono text-[12px]">{empty}</div>}
  </div>);
}
