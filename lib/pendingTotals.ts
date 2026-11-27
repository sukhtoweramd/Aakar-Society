// What waits for a committee login (27 Nov 2026). Pure, so tests can load it.
// The main page shows one red number on COMMITTEE and one on BILLING; the same parts show on the sub-tabs inside.
export type PendingParts = {
  complaints: number;   // complaints not closed
  bookings: number;     // booking requests waiting for a decision
  amc: number;          // AMC contracts that need renewal
  minutes: number;      // overdue action points from meetings
  letters: number;      // letters members asked for (requested or approved, not yet issued)
  payments: number;     // "I have paid" reports waiting to be verified
  unassigned: number;   // areas without a responsible member (amber, a set-up reminder: not counted in the red number)
};

export const noPending: PendingParts = { complaints: 0, bookings: 0, amc: 0, minutes: 0, letters: 0, payments: 0, unassigned: 0 };

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

/** Red numbers for the two committee buttons on the main page. */
export function pendingTotals(p: Partial<PendingParts> | null | undefined): { committee: number; billing: number } {
  const x = p || {};
  return { committee: n(x.complaints) + n(x.bookings) + n(x.amc) + n(x.minutes) + n(x.letters), billing: n(x.payments) };
}
