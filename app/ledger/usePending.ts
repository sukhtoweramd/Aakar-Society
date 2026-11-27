"use client";
// Counts of what waits for a committee login, read through the login's own client (database rules apply).
// Re-read whenever the screen changes, so a number drops after the work is done. Any failed read counts as 0.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { amcAlerts, loadAmc, loadAreas } from "@/lib/committee";
import { loadComplaints } from "@/lib/complaints";
import { isOverdue, loadMeetings } from "@/lib/minutes";
import { loadReports } from "@/lib/payReports";
import { noPending, type PendingParts } from "@/lib/pendingTotals";

export function usePending(on: boolean, refreshKey: string): PendingParts {
  const [p, setP] = useState<PendingParts>(noPending);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const safe = async <T,>(f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch { return d; } };
    (async () => {
      const [comp, book, areas, amc, mt, rep, lr] = await Promise.all([
        safe(() => loadComplaints(), null),
        safe(async () => (await supabase.from("bookings").select("group_id").eq("status", "pending")).data as any[] | null, null),
        safe(() => loadAreas(true), null),
        safe(() => loadAmc(), null),
        safe(() => loadMeetings(), null),
        safe(() => loadReports(), null),
        safe(async () => (await supabase.from("letter_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "approved"])).count, 0),
      ]);
      if (!live) return;
      const society = (mt?.meetings || []).filter((m) => m.kind !== "Event");
      setP({
        complaints: (comp || []).filter((x) => x.status !== "closed").length,
        bookings: new Set((book || []).map((r) => r.group_id)).size,
        amc: amc ? amcAlerts(amc.amc).length : 0,
        minutes: (mt?.actions || []).filter((a) => society.some((m) => m.id === a.meeting_id) && isOverdue(a)).length,
        letters: Number(lr) || 0,
        payments: (rep || []).filter((r) => r.status === "pending").length,
        unassigned: (areas || []).filter((a) => a.active && !a.holder_flat).length,
      });
    })();
    return () => { live = false; };
  }, [on, refreshKey]);
  return p;
}
