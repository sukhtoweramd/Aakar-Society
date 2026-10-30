// Phone home screen buttons (30 Oct 2026): which buttons each login gets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { committeeMenu, memberMenu, tenantMenu, SECTION_TITLE } from "../lib/phoneMenu";
import { ALWAYS_TABS, residentTabs, tenantTabs } from "../lib/memberTabs";

const keys = (l: { key: string }[]) => l.map((x) => x.key);

test("owner: all flat buttons; nominee only when not rented; action points only when open ones exist", () => {
  const own = memberMenu({ rented: false, allowed: residentTabs(null), openActions: 0 });
  for (const k of ["bills", "family", "vehicles", "documents", "letters", "complaints", "booking", "nominee", "emergency", "contacts", "details"]) assert.ok(keys(own.flat).includes(k), k);
  assert.ok(!keys(own.flat).includes("actions"));
  assert.ok(keys(memberMenu({ rented: false, allowed: [], openActions: 2 }).flat).includes("actions"));
  assert.ok(!keys(memberMenu({ rented: true, allowed: [], openActions: 0 }).flat).includes("nominee"));
});

test("owner: society buttons follow ADMIN → MEMBER SCREENS", () => {
  const some = memberMenu({ rented: false, allowed: residentTabs(["EVENTS"]), openActions: 0 });
  assert.deepEqual(keys(some.society).sort(), ["EVENTS", "NOTICES"]);
  const all = memberMenu({ rented: false, allowed: residentTabs(null), openActions: 0 });
  assert.ok(keys(all.society).includes("DIRECTORY") && keys(all.society).includes("VAULT"));
  assert.ok(!keys(all.society).includes("DETAIL"), "MY FLAT is the home screen itself, not a button");
});

test("tenant: never owner matters or owners' screens, even when every member screen is open", () => {
  const m = tenantMenu({ allowed: tenantTabs(null) });
  for (const k of ["bills", "documents", "letters", "nominee", "details", "actions"]) assert.ok(!keys(m.flat).includes(k), k);
  for (const k of ["DIRECTORY", "BUSINESS", "VAULT", "INDEX", "FLOOR"]) assert.ok(!keys(m.society).includes(k), k);
  assert.deepEqual(keys(m.flat), ["family", "vehicles", "emergency", "complaints", "booking", "contacts"]);
  assert.ok(keys(m.society).includes("NOTICES"));
  assert.ok(ALWAYS_TABS.includes("NOTICES"));
});

test("committee: work buttons, MY FLAT only when linked to a flat", () => {
  assert.ok(keys(committeeMenu({ homeFlat: true }).work).includes("MYFLAT"));
  assert.ok(!keys(committeeMenu({ homeFlat: false }).work).includes("MYFLAT"));
  for (const k of ["BILLING", "COMMITTEE", "ADMIN", "REPORTS", "INDEX"]) assert.ok(keys(committeeMenu({ homeFlat: false }).work).includes(k), k);
});

test("every section has a title for the HOME bar", () => {
  const all = [...memberMenu({ rented: false, allowed: [], openActions: 1 }).flat, ...tenantMenu({ allowed: [] }).flat];
  for (const t of all) assert.ok(t.section && SECTION_TITLE[t.section], t.key);
});
