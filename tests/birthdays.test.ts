import test from "node:test";
import assert from "node:assert/strict";
import { birthdaysToday } from "../lib/birthdays";

const rows = [
  { flat_id: "B-1103", tower: "B", member_name: "Ramesh Patel", birth_day: 31, birth_month: 10 },
  { flat_id: "A-402", tower: "A", member_name: "Anita Shah", birth_day: 31, birth_month: 10 },
  { flat_id: "A-1201", tower: "A", member_name: "Kabir Mehta", birth_day: 1, birth_month: 11 },
  { flat_id: "C-205", tower: "C", member_name: null, birth_day: 31, birth_month: 10 },
  { flat_id: "C-206", tower: "C", member_name: "No date", birth_day: null, birth_month: null },
];
test("only today's birthdays, in tower / flat order", () => {
  const r = birthdaysToday(rows, new Date(2026, 9, 31));
  assert.deepEqual(r.map((x) => x.name), ["Anita Shah", "Ramesh Patel"]);
});
test("nobody today gives an empty list", () => assert.equal(birthdaysToday(rows, new Date(2026, 9, 30)).length, 0));
test("29 Feb is wished on 28 Feb in a non-leap year only", () => {
  const f = [{ flat_id: "A-1", tower: "A", member_name: "Leap", birth_day: 29, birth_month: 2 }];
  assert.equal(birthdaysToday(f, new Date(2027, 1, 28)).length, 1);
  assert.equal(birthdaysToday(f, new Date(2028, 1, 28)).length, 0);
  assert.equal(birthdaysToday(f, new Date(2028, 1, 29)).length, 1);
});
