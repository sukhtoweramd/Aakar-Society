// Maintenance maths (30 Oct 2026). No database or browser code here, so it can be tested directly.
// Annual rate per flat (flats.maintenance); bills cover a share of the year; rented flats pay a multiple.
export type Line = { description: string; rate?: number | null; qty?: number | null; amount: number };
const num = (n: any) => Number(n || 0);
const inr = (n: any) => num(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Decided 30 Oct 2026: rented flats pay 1.5 × standard maintenance (changeable in BILLING → SETTINGS). */
export const DEFAULT_RENT_MULTIPLIER = 1.5;
export const rentMultiplier = (s?: { rent_multiplier?: number | null } | null) => { const m = Number(s?.rent_multiplier); return m >= 1 && m <= 5 ? m : DEFAULT_RENT_MULTIPLIER; };
/** Maintenance is an ANNUAL rate (flats.maintenance, set in ADMIN → charges). A bill for a period charges the share of the
 *  year it covers: a half-year (6 months) = annual ÷ 2. A rented flat adds (multiplier − 1) × that standard amount as a
 *  separate line, only on standard maintenance (never on arrears, penalties or interest). Rupees, rounded. */
export function maintenanceCharge(annual: number | null | undefined, months: number, rented: boolean, multiplier = DEFAULT_RENT_MULTIPLIER): { lines: Line[]; amount: number } {
  const a = num(annual);
  if (a <= 0 || months <= 0) return { lines: [], amount: 0 };
  const share = months / 12;
  const base = Math.round(a * share);
  const lines: Line[] = [{ description: `Maintenance charges (annual ₹${inr(a)})`, rate: a, qty: share, amount: base }];
  if (rented && multiplier > 1) {
    const extra = Math.round(base * (multiplier - 1));
    lines.push({ description: `Additional maintenance for rented flat (${multiplier} × standard)`, rate: base, qty: Math.round((multiplier - 1) * 100) / 100, amount: extra });
  }
  return { lines, amount: lines.reduce((n, l) => n + l.amount, 0) };
}
