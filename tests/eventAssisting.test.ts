// Event role Assisting, also for the tenant of a rented flat (30 Oct 2026). Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { myTeamRole, seesEventAccounts, teamMemberName } from "../lib/eventTeamRules";

const team = [
  { event_id: "E1", flat_id: "A101", person: null, role: "Convenor", member_kind: "flat" as const },
  { event_id: "E1", flat_id: "A202", person: null, role: "Assisting", member_kind: "tenant" as const },
  { event_id: "E2", flat_id: "A202", person: null, role: "Member", member_kind: "flat" as const },
];
const flats = [{ id: "A101", owner_name: "OWNER A", occupancy: "owner" }, { id: "A202", owner_name: "OWNER B", tenant_name: "TENANT B", occupancy: "tenant" }];

test("a tenant login matches only its own tenant row; the owner's flat login only the household row", () => {
  assert.equal(myTeamRole(team, "E1", { tenantFlat: "A202" }), "Assisting");
  assert.equal(myTeamRole(team, "E1", { homeFlat: "A202" }), null);          // owner of A202 is not on E1's team
  assert.equal(myTeamRole(team, "E2", { tenantFlat: "A202" }), null);        // the household row is not the tenant's
  assert.equal(myTeamRole(team, "E2", { homeFlat: "A202" }), "Member");
  assert.equal(myTeamRole(team, "E1", { homeFlat: "A101" }), "Convenor");
});

test("tenant rows show the tenant's name", () => {
  assert.equal(teamMemberName(flats, team[1]), "TENANT B");
  assert.equal(teamMemberName(flats, team[0]), "OWNER A");
  assert.equal(teamMemberName(flats, { ...team[0], person: "SON A" }), "SON A");
});

test("Assisting does not see the event money book", () => {
  assert.equal(seesEventAccounts("Assisting"), false);
  assert.equal(seesEventAccounts(null), false);
  for (const r of ["Convenor", "Treasurer", "Member"]) assert.equal(seesEventAccounts(r), true);
});
