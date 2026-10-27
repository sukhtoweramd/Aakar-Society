// Gate entries (EVENT_CHECKINS.sql) and the ATTENDED counts. Plain logic only (no database), shared with the tests.
export type Checkin = { id: string; event_id: string; reg_id: string; flat_id: string; session_id: string; people: number; scanned_by: string | null; created_at: string };

/** How many have come in: per session, and per registration + session. */
export function attended(checkins: Checkin[] | null | undefined) {
  const bySession: Record<string, number> = {}, byReg: Record<string, number> = {};
  (checkins || []).forEach((k) => { bySession[k.session_id] = (bySession[k.session_id] || 0) + k.people; byReg[`${k.reg_id}|${k.session_id}`] = (byReg[`${k.reg_id}|${k.session_id}`] || 0) + k.people; });
  return { bySession, byReg };
}
