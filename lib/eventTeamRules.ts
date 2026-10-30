// Event team (30 Oct 2026): who a team row is and what role the logged-in person has. No database code (tests load it).
type Row = { event_id: string; flat_id: string; person: string | null; role: string; member_kind?: "flat" | "tenant" | null };
type FlatLite = { id: string; owner_name: string | null; tenant_name?: string | null; occupancy?: string | null };

export const isTenantRow = (t: Pick<Row, "member_kind">) => t.member_kind === "tenant";

/** Name shown for a team row: the person typed in, else the tenant (tenant rows) or the person living there. */
export function teamMemberName(flats: FlatLite[], t: Row): string {
  const f = flats.find((x) => x.id === t.flat_id);
  if (t.person?.trim()) return t.person.trim();
  if (!f) return t.flat_id;
  if (isTenantRow(t)) return f.tenant_name?.trim() || "Tenant";
  const living = f.occupancy === "tenant" ? f.tenant_name?.trim() : f.owner_name?.trim();
  return living || f.owner_name?.trim() || "Owner not recorded";
}

/** The logged-in person's role in an event: a flat login matches its flat's household row, a tenant login only its own tenant row. */
export function myTeamRole<R extends Row>(team: R[], eventId: string, who: { homeFlat?: string | null; tenantFlat?: string | null }): R["role"] | null {
  const mine = team.filter((t) => t.event_id === eventId && (
    (!isTenantRow(t) && !!who.homeFlat && t.flat_id === who.homeFlat) ||
    (isTenantRow(t) && !!who.tenantFlat && t.flat_id === who.tenantFlat)));
  return mine.sort((a, b) => Number(isTenantRow(a)) - Number(isTenantRow(b)))[0]?.role ?? null;
}

/** Assisting helps on the day (team, minutes, gate list, gate scan) but does not see the event's money book. */
export const seesEventAccounts = (role: string | null) => role === "Convenor" || role === "Treasurer" || role === "Member";
