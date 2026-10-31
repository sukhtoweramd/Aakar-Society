// Common plot bookings (item 21). Plain helpers shared by the screen and the tests.
// Full day only since BOOKING_CHARGES.sql ("day"); older bookings keep "morning" / "evening" as history.
export type Slot = "morning" | "evening" | "day";
export type BookingRow = {
  id: string; group_id: string; flat_id: string; area_id: string; area_name: string; book_date: string; slot: Slot; purpose: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled"; reason: string | null; decided_by: string | null; decided_at: string | null;
  notice_id: string | null; created_by: string | null; created_at: string;
  charge?: number | null; booked_by?: "owner" | "tenant" | "committee" | null; bill_name?: string | null; free_event?: boolean | null; bill_id?: string | null;
};
export type Area = { id: string; name: string; description: string | null; sort: number; active: boolean; charge?: number | null };
export type Taken = { area_id: string; book_date: string; slot: Slot; status: "pending" | "approved"; flat_id: string };
export type Group = { group_id: string; flat_id: string; book_date: string; slot: Slot; status: BookingRow["status"]; areas: string[]; purpose: string | null;
  reason: string | null; decided_by: string | null; notice_id: string | null; created_at: string;
  total: number; free_event: boolean; booked_by: string | null; bill_id: string | null; bill_name: string | null };

/** "Full day" for new bookings; "Morning" / "Evening" for old ones. */
export const slotName = (s: Slot) => (s === "morning" ? "Morning" : s === "evening" ? "Evening" : "Full day");
/** Charge of a booking row (a missing value counts as no charge). */
export const chargeOf = (r: Pick<BookingRow, "charge" | "free_event">) => (r.free_event ? 0 : Math.max(0, Number(r.charge) || 0));
export const rupees = (n: number) => "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
/** The four areas in the order members expect: Tower A, Center, Tower B, Main common. */
export const sortAreas = <T extends { sort: number; name: string }>(a: T[]) => [...a].sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name));
/** Total for areas picked together. */
export const totalFor = (areas: Pick<Area, "id" | "charge">[], picked: string[], free = false) =>
  free ? 0 : areas.filter((a) => picked.includes(a.id)).reduce((n, a) => n + Math.max(0, Number(a.charge) || 0), 0);
/** Who may set charges / approve: exact designation of a committee login's flat (the database does the real check). */
export const isApproverRole = (role: string | null | undefined) => ["chairman", "secretary"].includes(String(role || "").trim().toLowerCase());
export const STATUS: Record<Group["status"], { text: string; cls: string }> = {
  pending: { text: "WAITING FOR APPROVAL", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  approved: { text: "CONFIRMED", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { text: "NOT APPROVED", cls: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { text: "CANCELLED", cls: "bg-gray-100 text-gray-600 border-gray-300" },
};

/** Today in India (YYYY-MM-DD), and a date n days later. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
export const dayText = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
export const flatLabel = (id: string) => id.replace(/^([A-Z])/, "$1-");

/** One card per request: rows that were asked for together. */
export function groupRows(rows: BookingRow[]): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const g = m.get(r.group_id);
    if (g) { g.areas.push(r.area_name); g.total += chargeOf(r); continue; }
    m.set(r.group_id, { group_id: r.group_id, flat_id: r.flat_id, book_date: r.book_date, slot: r.slot, status: r.status, areas: [r.area_name], purpose: r.purpose,
      reason: r.reason, decided_by: r.decided_by, notice_id: r.notice_id, created_at: r.created_at,
      total: chargeOf(r), free_event: !!r.free_event, booked_by: r.booked_by || null, bill_id: r.bill_id || null, bill_name: r.bill_name || null });
  }
  return Array.from(m.values()).map((g) => ({ ...g, areas: g.areas.sort() }));
}

/** May the member still cancel? (until the day before) */
export const memberCanCancel = (g: Group, today = istToday()) => (g.status === "pending" || g.status === "approved") && g.book_date > today;

/** Who has an area on a date (or null when free). The whole day is taken, whatever the old morning / evening slot was. */
export const takenBy = (taken: Taken[], areaId: string, date: string) => taken.find((t) => t.area_id === areaId && t.book_date === date) || null;

/** Same wording as the notice the database posts on approval (for sharing on WhatsApp). */
export function noticeText(g: Pick<Group, "areas" | "flat_id" | "book_date" | "slot">, allAreaCount: number) {
  const when = `${dayText(g.book_date)} (${slotName(g.slot).toLowerCase()})`;
  const list = g.areas.join(", ");
  return g.areas.length >= allAreaCount
    ? `Aakar society notice: All common plot areas (${list}) are booked by Flat ${flatLabel(g.flat_id)} on ${when}. All vehicles should be parked outside the premises during this time. Thank you.`
    : `Aakar society notice: ${list} is booked by Flat ${flatLabel(g.flat_id)} on ${when}. Please remove vehicles parked in ${list} before then. Thank you.`;
}

/** WhatsApp text to the member when an invoice is raised on approval. */
export function invoiceText(g: Pick<Group, "areas" | "book_date" | "total">, billNo: string) {
  return `Aakar society: your booking of ${g.areas.join(", ")} on ${dayText(g.book_date)} is approved. Invoice ${billNo}: ${rupees(g.total)}. Please pay by bank transfer / UPI and tap I HAVE PAID in the app. Thank you.`;
}
