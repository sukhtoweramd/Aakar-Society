// Committee members of a flat: one or several family members, each with a designation (sample names only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { committeeName, committeePeople, committeeText, topRole } from "../lib/society";

test("several family members on the committee, highest designation first", () => {
  const f: any = { is_committee: true, committee_role: "Committee Member", owner_name: "OWNER ONE",
    committee_members: [{ name: "SON ONE", role: "Co-opted Member" }, { name: "OWNER ONE", role: "Committee Member" }] };
  assert.deepEqual(committeePeople(f).map((p) => p.name), ["OWNER ONE", "SON ONE"]);
  assert.equal(committeeText(f), "OWNER ONE (Committee Member), SON ONE (Co-opted Member)");
  assert.equal(committeeName(f), "OWNER ONE & SON ONE");
  assert.equal(topRole(committeePeople(f)), "Committee Member");
});

test("no list: the chosen person or the owner, with the flat's designation", () => {
  assert.deepEqual(committeePeople({ is_committee: true, committee_role: "Secretary", owner_name: "OWNER TWO" } as any), [{ name: "OWNER TWO", role: "Secretary" }]);
  assert.deepEqual(committeePeople({ is_committee: true, committee_role: null, owner_name: "OWNER", committee_person: "WIFE" } as any), [{ name: "WIFE", role: "Committee Member" }]);
  assert.deepEqual(committeePeople({ is_committee: false, owner_name: "X" } as any), []);
});

// Display order (30 Oct 2026): Chairman, Secretary, Treasurer first, then everyone else in flat order.
import { byCommitteeRole, committeeRoster, isCoopted } from "../lib/society";
test("committee order: office bearers first, then flat order", () => {
  const fl = (id: string, tower: string, role: string, extra: any = {}) => ({ id, flat_no: id, tower, is_committee: true, committee_role: role, owner_name: "OWNER " + id, ...extra });
  const flats: any[] = [
    fl("C701", "C", "Treasurer"), fl("A1201", "A", "Committee Member"), fl("A301", "A", "Secretary"),
    fl("B501", "B", "Chairman"), fl("A201", "A", "Co-opted Member"), fl("B103", "B", "Committee Member"),
    { id: "X", tower: null, is_committee: true, committee_role: "Committee Member", owner_name: "NO TOWER" },
    fl("A101", "A", "Secretary"), fl("B701", "C", "Co-opted Member", { flat_no: "B701/702" }),
  ];
  assert.deepEqual([...flats].sort(byCommitteeRole).map((f) => f.id), ["B501", "A101", "A301", "C701", "A201", "A1201", "B103", "B701", "X"]);
  const two = fl("A501", "A", "Committee Member", { committee_members: [{ name: "FATHER", role: "Committee Member" }, { name: "SON", role: "Co-opted Member" }] });
  const r = committeeRoster([fl("A901", "A", "Chairman"), two, fl("A401", "A", "Treasurer")] as any);
  assert.deepEqual(r.map((p) => `${p.flat.id}:${p.role}`), ["A901:Chairman", "A401:Treasurer", "A501:Committee Member", "A501:Co-opted Member"]);
  assert.equal(isCoopted("Co-opted Member"), true);
  assert.equal(isCoopted("Committee Member"), false);
  assert.deepEqual(committeeRoster([{ id: "A1", is_committee: true, committee_role: null, owner_name: null } as any]).map((p) => p.role), ["Committee Member"]);
});
