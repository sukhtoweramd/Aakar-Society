// Booking helpers. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, groupRows, istToday, memberCanCancel, noticeText, takenBy, type BookingRow } from "../lib/bookings";

const row = (o: Partial<BookingRow>): BookingRow => ({ id: "r", group_id: "g1", flat_id: "A503", area_id: "a1", area_name: "TOWER-A", book_date: "2026-11-01", slot: "evening", purpose: null,
  status: "approved", reason: null, decided_by: null, decided_at: null, notice_id: null, created_by: null, created_at: "2026-10-25T00:00:00Z", ...o });

test("India date and adding days", () => {
  assert.equal(istToday(new Date("2026-10-25T20:00:00Z")), "2026-10-26");   // 1:30 am in India
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("rows asked together become one card", () => {
  const g = groupRows([row({ id: "1", area_name: "TOWER-B" }), row({ id: "2", area_name: "COMMON" }), row({ id: "3", group_id: "g2" })]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].areas, ["COMMON", "TOWER-B"]);
});

test("member may cancel until the day before", () => {
  const g = groupRows([row({})])[0];
  assert.equal(memberCanCancel(g, "2026-10-31"), true);
  assert.equal(memberCanCancel(g, "2026-11-01"), false);
  assert.equal(memberCanCancel({ ...g, status: "rejected" }, "2026-10-01"), false);
});

test("notice wording and taken slots", () => {
  assert.match(noticeText({ areas: ["TOWER-A"], flat_id: "A503", book_date: "2026-11-01", slot: "evening" }, 3), /remove vehicles parked in TOWER-A/);
  assert.match(noticeText({ areas: ["COMMON", "TOWER-A", "TOWER-B"], flat_id: "A503", book_date: "2026-11-01", slot: "morning" }, 3), /parked outside the premises/);
  const t = [{ area_id: "a1", book_date: "2026-11-01", slot: "evening" as const, status: "approved" as const, flat_id: "A503" }];
  assert.ok(takenBy(t, "a1", "2026-11-01"));            // the whole day is taken
  assert.equal(takenBy(t, "a1", "2026-11-02"), null);
  assert.equal(takenBy(t, "a2", "2026-11-01"), null);
});
