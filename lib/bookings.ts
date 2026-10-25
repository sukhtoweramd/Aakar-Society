// Common plot bookings (item 21). Plain helpers shared by the screen and the tests.
export type Slot = "morning" | "evening";
export type BookingRow = {
  id: string; group_id: string; flat_id: string; area_id: string; area_name: string; book_date: string; slot: Slot; purpose: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled"; reason: string | null; decided_by: string | null; decided_at: string | null;
  notice_id: string | null; created_by: string | null; created_at: string;
};
export type Area = { id: string; name: string; description: string | null; sort: number; active: boolean };
export type Taken = { area_id: string; book_date: string; slot: Slot; status: "pending" | "approved"; flat_id: string };
export type Group = { group_id: string; flat_id: string; book_date: string; slot: Slot; status: BookingRow["status"]; areas: string[]; purpose: string | null;
  reason: string | null; decided_by: string | null; notice_id: string | null; created_at: string };

export const SLOTS: { key: Slot; name: string }[] = [{ key: "morning", name: "Morning" }, { key: "evening", name: "Evening" }];
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
    if (g) { g.areas.push(r.area_name); continue; }
    m.set(r.group_id, { group_id: r.group_id, flat_id: r.flat_id, book_date: r.book_date, slot: r.slot, status: r.status, areas: [r.area_name], purpose: r.purpose,
      reason: r.reason, decided_by: r.decided_by, notice_id: r.notice_id, created_at: r.created_at });
  }
  return Array.from(m.values()).map((g) => ({ ...g, areas: g.areas.sort() }));
}

/** May the member still cancel? (until the day before) */
export const memberCanCancel = (g: Group, today = istToday()) => (g.status === "pending" || g.status === "approved") && g.book_date > today;

/** Who has an area on a date and slot (or null when free). */
export const takenBy = (taken: Taken[], areaId: string, date: string, slot: Slot) => taken.find((t) => t.area_id === areaId && t.book_date === date && t.slot === slot) || null;

/** Same wording as the notice the database posts on approval (for sharing on WhatsApp). */
export function noticeText(g: Pick<Group, "areas" | "flat_id" | "book_date" | "slot">, allAreaCount: number) {
  const when = `${dayText(g.book_date)} (${g.slot})`;
  const list = g.areas.join(", ");
  return g.areas.length >= allAreaCount
    ? `Aakar society notice: All common plot areas (${list}) are booked by Flat ${flatLabel(g.flat_id)} on ${when}. All vehicles should be parked outside the premises during this time. Thank you.`
    : `Aakar society notice: ${list} is booked by Flat ${flatLabel(g.flat_id)} on ${when}. Please remove vehicles parked in ${list} before then. Thank you.`;
}
