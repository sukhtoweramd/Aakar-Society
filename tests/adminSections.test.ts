import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_SECTIONS, isAdminSection, sectionTitle } from "../lib/adminSections";

const a = readFileSync("app/ledger/AdminTab.tsx", "utf8");

test("every ADMIN section has a unique key, a title and a one-line description", () => {
  const keys = ADMIN_SECTIONS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of ADMIN_SECTIONS) { assert.ok(s.title && s.desc && s.icon, s.key); assert.equal(sectionTitle(s.key), s.title); }
  assert.equal(isAdminSection("BACKUP"), true); assert.equal(isAdminSection("nope"), false); assert.equal(isAdminSection(undefined), false);
});

test("ADMIN opens as a menu; each section shows its own panel, with a way back", () => {
  assert.match(a, /if \(!section\) return \(/);                       // the menu comes first
  assert.match(a, /← ADMIN/);                                          // and a back button in every section
  for (const s of ADMIN_SECTIONS) assert.match(a, new RegExp(`section === "${s.key}"`), `${s.key} has a panel`);
  // every panel is drawn in exactly one section (none lost, none shown twice)
  for (const p of ["OwnerChecklist", "FlatSetupPanel", "BookingAreasPanel", "CommitteePanel", "LoginsPanel", "MemberScreensPanel", "BackupPanel", "TestDataPanel", "AiReadPanel", "HelpGuidePanel", "StoragePanel"]) {
    assert.equal((a.match(new RegExp(`<${p}[ />]`, "g")) || []).length, 1, p);
  }
  assert.match(a, /SOCIETY CHARGES CONTROL PANEL/);
});

test("menu tiles are phone sized: two columns, at least 44 px tall, no sideways scroll", () => {
  assert.match(a, /grid-cols-2/); assert.match(a, /min-h-\[88px\]/); assert.match(a, /min-w-0/);
  assert.match(a, /min-h-\[44px\]/);
});
