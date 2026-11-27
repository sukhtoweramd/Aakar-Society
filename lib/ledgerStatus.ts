// The "Ledger Status" line on the cover (27 Nov 2026). It used to say "LIVE" in static text for every society, even before GO LIVE.
// Now it follows the real GO LIVE flag (table `society_live`, one row once GO LIVE was pressed). Only committee logins can read that table
// (database rule), so members see no status line, and while it is unknown (loading / unreadable) nothing is shown rather than a guess.
// Pure file (no supabaseClient) so tests can load it.
export type LedgerStatus = { text: string; tone: "live" | "test" };

/** live: true = the GO LIVE row exists, false = no row yet (still testing), null = not known (member login, still loading, or not readable). */
export function ledgerStatus(live: boolean | null): LedgerStatus | null {
  if (live === null) return null;
  return live ? { text: "LIVE", tone: "live" } : { text: "TEST MODE", tone: "test" };
}
