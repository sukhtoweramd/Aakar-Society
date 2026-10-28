"use client";
// Committee areas of responsibility and the AMC register.
import { supabase } from "./supabaseClient";
import { committeeName, label, type Flat } from "./society";

export type Area = { id: string; name: string; description: string | null; holder_flat: string | null; backup_flat: string | null; contact_phone: string | null; sort: number; active: boolean };
export type Amc = {
  id: string; area_id: string | null; vendor: string; contact_person: string | null; contact_phone: string | null; covers: string;
  start_date: string; end_date: string; amount: number | null; payment_terms: string | null; visits_per_year: number | null;
  file_key: string | null; notes: string | null; status: "active" | "renewed" | "closed"; renewed_from: string | null; created_at: string;
};
export type Visit = { id: string; amc_id: string; visit_date: string; done_by: string | null; work: string | null; checked_by: string | null; created_at: string };

const missing = (msg: string) => /committee_areas|amc_|schema cache|does not exist/i.test(msg);

/** null = not set up yet (run COMMITTEE_AMC.sql) */
export async function loadAreas(all = false): Promise<Area[] | null> {
  let q = supabase.from("committee_areas").select("*").order("sort").order("name");
  if (!all) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) return missing(error.message) ? null : [];
  return (data as Area[]) || [];
}
export async function loadAmc(): Promise<{ amc: Amc[]; visits: Visit[] } | null> {
  const [a, v] = await Promise.all([supabase.from("amc_contracts").select("*").order("end_date"), supabase.from("amc_visits").select("*").order("visit_date", { ascending: false })]);
  if (a.error) return missing(a.error.message) ? null : { amc: [], visits: [] };
  return { amc: (a.data as Amc[]) || [], visits: (v.data as Visit[]) || [] };
}

/** Name to show for a committee member's flat: owner • role • flat */
export function personOf(flats: Flat[], id: string | null) {
  const f = flats.find((x) => x.id === id);
  if (!f) return null;
  return { name: committeeName(f), role: f.committee_role || "", flat: label(f) };
}

export const daysLeft = (end: string) => Math.ceil((new Date(end + "T23:59:59").getTime() - Date.now()) / 864e5);
export function amcState(a: Amc): { key: "expired" | "expiring" | "active" | "renewed" | "closed"; text: string } {
  if (a.status === "renewed") return { key: "renewed", text: "RENEWED" };
  if (a.status === "closed") return { key: "closed", text: "CLOSED" };
  const d = daysLeft(a.end_date);
  if (d < 0) return { key: "expired", text: `EXPIRED ${-d} DAY${d === -1 ? "" : "S"} AGO` };
  if (d <= 30) return { key: "expiring", text: d === 0 ? "EXPIRES TODAY" : `EXPIRES IN ${d} DAY${d === 1 ? "" : "S"}` };
  return { key: "active", text: "ACTIVE" };
}
/** Contracts that need attention: expiring within 30 days or expired (and not renewed/closed) */
export const amcAlerts = (list: Amc[]) => list.filter((a) => { const k = amcState(a).key; return k === "expired" || k === "expiring"; });
