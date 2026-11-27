"use client";
// A slim amber line for COMMITTEE logins while the society has not pressed GO LIVE: the papers made now are test papers.
// It reads the real flag (table society_live) through the login's own client; members cannot read it, so they never see it.
// While unknown (loading / unreadable) nothing is shown. Disappears for ever after GO LIVE (ADMIN -> Test data & go live).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ledgerStatus } from "@/lib/ledgerStatus";

export default function TestModeBanner({ isCommittee, onOpenAdmin }: { isCommittee: boolean; onOpenAdmin: () => void }) {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let off = false;
    if (!isCommittee) { setLive(null); return; }
    supabase.from("society_live").select("id").eq("id", 1).maybeSingle().then(({ data, error }) => { if (!off) setLive(error ? null : !!data); }, () => { if (!off) setLive(null); });
    return () => { off = true; };
  }, [isCommittee]);
  if (ledgerStatus(live)?.tone !== "test") return null;
  return (
    <div className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 mono text-[11px] leading-snug">
      <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="tracking-[0.1em]">TEST MODE</b>
        <span className="min-w-0">Bills, receipts and letters made now are test papers. Before real use: ADMIN → Test data &amp; go live.</span>
        <button onClick={onOpenAdmin} className="ml-auto underline font-bold min-h-[32px]">OPEN ADMIN</button>
      </div>
    </div>
  );
}
