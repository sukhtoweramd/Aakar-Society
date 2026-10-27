// Gate scanning: ATTENDED adds up the people let in per meal and per pass (sample data only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attended } from "../lib/eventReg";

test("attended sums entries per session and per registration", () => {
  const k = (reg_id: string, session_id: string, people: number) => ({ id: `${reg_id}${session_id}${people}`, event_id: "e", reg_id, flat_id: "A101", session_id, people, scanned_by: null, created_at: "" });
  const a = attended([k("r1", "s1", 3), k("r1", "s1", 1), k("r2", "s1", 2), k("r1", "s2", 4)]);
  assert.deepEqual(a.bySession, { s1: 6, s2: 4 });
  assert.equal(a.byReg["r1|s1"], 4);
  assert.equal(a.byReg["r2|s1"], 2);
  assert.deepEqual(attended(null), { bySession: {}, byReg: {} });
});
