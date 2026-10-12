"use client";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { buildCategories, sortFlats, SOCIETY, type Flat } from "@/lib/society";
import { RESIDENT_TABS, TABS, type Ctx, type Tab } from "./ledger/ctx";
import ChangePassword from "./ledger/ChangePassword";
import { label } from "@/lib/society";
import Login from "./ledger/Login";
import Sidebar from "./ledger/Sidebar";
import CoverTab from "./ledger/CoverTab";
import IndexTab from "./ledger/IndexTab";
import FloorTab from "./ledger/FloorTab";
import DetailTab from "./ledger/DetailTab";
import BusinessTab from "./ledger/BusinessTab";
import VaultTab from "./ledger/VaultTab";
import NoticesTab from "./ledger/NoticesTab";
import EventsTab from "./ledger/EventsTab";
import AdminTab from "./ledger/AdminTab";
import ReportsTab from "./ledger/ReportsTab";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("COVER");
  const [flats, setFlats] = useState<Flat[]>([]);
  const [loadError, setLoadError] = useState("");
  const [towerFilter, setTowerFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const meta = (session?.user.app_metadata || {}) as Record<string, any>;
  const isCommittee = meta.role !== "resident";
  const myFlat: string | null = isCommittee ? null : String(meta.flat_id || "") || null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function reloadFlats() {
    // Committee sees every flat. Residents get the directory (names only) plus full details of their own flat.
    const { data, error } = await supabase.from("flats").select("*");
    if (error) { setLoadError(`Could not load flats: ${error.message}`); return; }
    let list = (data || []) as Flat[];
    if (!isCommittee) {
      const dir = await supabase.from("flat_directory").select("*");
      if (dir.error) { setLoadError(`Could not load directory: ${dir.error.message}`); return; }
      const own = new Map(list.map((f) => [f.id, f]));
      list = ((dir.data || []) as Flat[]).map((d) => own.get(d.id) || ({ ...d, bhk: null, maintenance: null, email: null } as Flat));
    }
    setLoadError("");
    list.sort(sortFlats);
    setFlats(list);
    setSelectedId((cur) => (isCommittee ? cur ?? list[0]?.id ?? null : myFlat));
  }
  useEffect(() => { if (session) reloadFlats(); }, [session?.user.id]);

  const categories = useMemo(() => buildCategories(flats), [flats]);

  function go(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (checking) return <div className="min-h-screen grid place-items-center mono text-[12px] opacity-60">Loading ledger…</div>;
  if (!session) return <Login />;
  const mustChange = !isCommittee && !(session.user.user_metadata as any)?.password_changed;
  if (mustChange || showPassword) return <ChangePassword forced={mustChange} who={myFlat ? `Flat ${myFlat}` : session.user.email || ""} onDone={() => setShowPassword(false)} />;
  const visibleTabs = isCommittee ? [...TABS] : RESIDENT_TABS;
  const who = myFlat ? `FLAT ${label({ id: myFlat, flat_no: myFlat } as any)}` : session.user.email;

  const ctx: Ctx = {
    email: session.user.email || "",
    isCommittee, myFlat,
    flats, categories, towerFilter, setTowerFilter, search, setSearch, selectedId,
    selectFlat: setSelectedId, go, reloadFlats,
  };
  const towerCount = (t: string) => flats.filter((f) => f.tower === t).length;

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[var(--bg)] text-[var(--ink)] antialiased" style={{ paddingTop: "var(--safe-area-inset-top)" }}>
      {/* Top strip */}
      <div className="w-full bg-[var(--navy)] text-[#fdfcf5] mono text-[12px] tracking-[0.06em] uppercase">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 min-h-[38px] py-1.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              SOCIETY LEDGER LIVE
            </span>
            <span className="opacity-40">•</span>
            <span>AHMEDABAD</span>
            <span className="opacity-40">•</span>
            <span className="text-[var(--gold)] font-semibold">{flats.length || 90} FLATS {SOCIETY.reg}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 opacity-80 mr-2 text-[11px]">
              <span>SUKH TOWER • MIRAMBICA ROAD</span>
              <span className="h-3 w-px bg-white/20" />
              <span className={myFlat ? "" : "normal-case"}>{who}</span>
            </div>
            <button onClick={() => setShowPassword(true)} className="border px-3 py-1.5 text-[11px] tracking-[0.06em] font-semibold rounded-[3px] bg-white/10 text-white border-white/20">PASSWORD</button>
            <button onClick={() => supabase.auth.signOut()} className="border px-3 py-1.5 text-[11px] tracking-[0.06em] font-semibold rounded-[3px] bg-[var(--gold)] text-black border-[var(--gold)]">
              LOGOUT
            </button>
          </div>
        </div>
      </div>

      {/* Header + nav */}
      <header className="sticky top-0 z-30 w-full max-w-[100vw] border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 min-h-[60px] py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[4px] bg-[var(--navy)] text-[var(--gold)] grid place-items-center serif text-[20px] font-bold">ॐ</div>
            <div className="leading-none">
              <div className="serif font-bold tracking-[0.06em] text-[15px]">{SOCIETY.name}</div>
              <div className="mono text-[11px] tracking-[0.06em] opacity-60 mt-0.5">{SOCIETY.reg} • HOUSING SOCIETY LEDGER</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
            {visibleTabs.map((m) => (
              <button key={m} onClick={() => go(m)}
                className={`mono text-[12px] tracking-[0.06em] px-3.5 py-2 rounded-[4px] border transition-all shrink-0 font-semibold ${tab === m ? "bg-[var(--navy)] text-white border-[var(--navy)] shadow-sm" : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--gold)] hover:bg-[var(--bg-soft)]"}`}>
                {m === "VAULT" ? "VAULT 🔒" : m === "DETAIL" && !isCommittee ? "MY FLAT" : m}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] w-full px-4 md:px-6 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start overflow-x-hidden">
        <Sidebar ctx={ctx} />
        <main className="order-1 lg:order-2 min-w-0 max-w-full overflow-x-hidden">
          <div className="mono text-[11px] opacity-40 mb-3 tracking-[0.04em]">
            SOCIETY LEDGER • TAB {tab} • {flats.length} FLATS • A {towerCount("A")} • B {towerCount("B")} • C {towerCount("C")}
          </div>
          {loadError && <div className="mb-4 border border-red-200 bg-red-50 text-red-700 p-3 mono text-[12px]">{loadError}</div>}
          {tab === "COVER" && <CoverTab ctx={ctx} />}
          {tab === "INDEX" && <IndexTab ctx={ctx} />}
          {tab === "FLOOR" && <FloorTab ctx={ctx} />}
          {tab === "DETAIL" && <DetailTab ctx={ctx} />}
          {tab === "BUSINESS" && <BusinessTab ctx={ctx} />}
          {tab === "VAULT" && <VaultTab ctx={ctx} />}
          {tab === "NOTICES" && <NoticesTab ctx={ctx} />}
          {tab === "EVENTS" && <EventsTab ctx={ctx} />}
          {tab === "ADMIN" && isCommittee && <AdminTab ctx={ctx} />}
          {tab === "REPORTS" && isCommittee && <ReportsTab ctx={ctx} />}
        </main>
      </div>

      <footer className="border-t border-[var(--border)] mt-8 mono text-[10px] px-6 py-4 opacity-60 flex flex-wrap gap-4 justify-between max-w-[1600px] mx-auto">
        <span>AAKAR CO-OP HOUSING SOCIETY {SOCIETY.reg} • Sukh Tower • Mirambica Road Naranpura • Ahmedabad • EST 1994</span>
        <span>Logged in: {who}{isCommittee ? " • Committee" : " • Resident"}</span>
      </footer>
    </div>
  );
}
