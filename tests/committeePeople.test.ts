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
