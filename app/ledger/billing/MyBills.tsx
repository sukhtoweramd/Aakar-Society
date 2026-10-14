"use client";
// MY FLAT: the member's own bills, payments and receipts (read-only) with PRINT MY LEDGER.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Flat } from "@/lib/society";
import { loadSettings, loadSignatories, type Bill, type Payment, type PrintCtx } from "@/lib/billing";
import LedgerCard from "./LedgerCard";

export default function MyBills({ flat, flats, email }: { flat: Flat; flats: Flat[]; email: string }) {
  const [data, setData] = useState<{ bills: Bill[]; pays: Payment[]; pc: PrintCtx } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    (async () => {
      const [b, p, s, sg] = await Promise.all([
        supabase.from("bills").select("*").eq("flat_id", flat.id), supabase.from("payments").select("*").eq("flat_id", flat.id),
        loadSettings(), loadSignatories(),
      ]);
      if (b.error) { setMissing(true); return; }
      setData({ bills: (b.data as Bill[]) || [], pays: (p.data as Payment[]) || [], pc: { settings: s, signatories: sg, flats } });
    })();
  }, [flat.id]);
  if (missing || !data || data.bills.length === 0) return null;
  return (
    <div>
      <div className="mono text-[10px] font-bold tracking-[0.14em] mb-2">MY BILLS &amp; RECEIPTS</div>
      <LedgerCard flat={flat} bills={data.bills} pays={data.pays} pc={data.pc} editable={false} email={email} />
    </div>
  );
}
