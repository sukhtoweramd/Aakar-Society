import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY_FACTS, checklistProgress, checklistSteps, factsFrom } from "../lib/ownerChecklist";

const ok = { profileFilled: true, towers: 2, flats: 10, flatsWithOwner: 10, committeeFlats: 3, flatsWithRate: 10, payDetails: true, signatories: 2, notices: 1, live: true };

test("a new society starts with nothing done and the first step next", () => {
  const p = checklistProgress(checklistSteps(EMPTY_FACTS));
  assert.equal(p.done, 0); assert.equal(p.next?.key, "profile"); assert.equal(p.complete, false);
  assert.equal(p.total, 10);          // the backup step is advice, not counted
});

test("a finished society is complete; the backup step never blocks it", () => {
  const steps = checklistSteps(ok); const p = checklistProgress(steps);
  assert.equal(p.complete, true); assert.equal(p.next, null);
  assert.equal(steps.find((s) => s.key === "backup")?.manual, true);
});

test("rates and owners are done only when every flat has them", () => {
  const s = (o: object) => Object.fromEntries(checklistSteps({ ...ok, ...o }).map((x) => [x.key, x.done]));
  assert.equal(s({ flatsWithRate: 9 }).rates, false); assert.equal(s({ flatsWithOwner: 9 }).owners, false);
  assert.equal(s({ flats: 0, flatsWithRate: 0, flatsWithOwner: 0 }).rates, false);   // no flats: nothing to say they are done
  assert.equal(s({ towers: 0 }).towers, false);
});

test("factsFrom counts only filled values", () => {
  const f = factsFrom({
    profile: { name: "X", full: "X SOCIETY", address: "  ", reg: "R1" }, towers: 1,
    flats: [{ owner_name: "A", is_committee: true, maintenance: 100 }, { owner_name: " ", is_committee: false, maintenance: 0 }, { owner_name: null, is_committee: null, maintenance: null }],
    settings: { account_no: "", upi_id: "" }, signatories: 0, notices: 0, live: false,
  });
  assert.equal(f.profileFilled, false); assert.equal(f.flats, 3); assert.equal(f.flatsWithOwner, 1);
  assert.equal(f.committeeFlats, 1); assert.equal(f.flatsWithRate, 1); assert.equal(f.payDetails, false);
  assert.equal(factsFrom({ profile: { name: "a", full: "b", address: "c", reg: "d" }, towers: 0, flats: [], settings: { upi_id: "x@y" }, signatories: 0, notices: 0, live: false }).payDetails, true);
  assert.equal(factsFrom({ profile: {}, towers: 0, flats: [], settings: null, signatories: 0, notices: 0, live: false }).payDetails, false);
});

test("the screen reads only the member's own client and writes nothing; it sits at the top of ADMIN", () => {
  const c = readFileSync("app/ledger/OwnerChecklist.tsx", "utf8");
  assert.doesNotMatch(c, /getAdminClient|\.insert\(|\.update\(|\.delete\(|\.upsert\(|fetch\(|api\(/);
  const a = readFileSync("app/ledger/AdminTab.tsx", "utf8");
  assert.ok(a.indexOf("<OwnerChecklist") < a.indexOf("<FlatSetupPanel"));
  assert.ok(a.indexOf("<OwnerChecklist") < a.indexOf("CALCULATED TOTALS"));
});
