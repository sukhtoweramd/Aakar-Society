// The cover's "Ledger Status" follows the real GO LIVE flag; it is never typed as LIVE. Imports only pure files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ledgerStatus } from "../lib/ledgerStatus";

test("status: LIVE only when GO LIVE was pressed, TEST MODE before, nothing while unknown", () => {
  assert.deepEqual(ledgerStatus(true), { text: "LIVE", tone: "live" });
  assert.deepEqual(ledgerStatus(false), { text: "TEST MODE", tone: "test" });
  assert.equal(ledgerStatus(null), null);
});

test("the cover reads the flag through the member's own client and never types LIVE", () => {
  const s = readFileSync(join(__dirname, "..", "app/ledger/CoverTab.tsx"), "utf8");
  assert.match(s, /from\("society_live"\)/);
  assert.match(s, /ledgerStatus\(live\)/);
  assert.ok(!/●\s*LIVE/.test(s), "the cover must not say LIVE in static text");
  assert.ok(!/admin\.from|getAdminClient/.test(s), "no server key on the cover");
});

test("the top strip has no blinking green dot that looks like a live signal (it is not tied to GO LIVE)", () => {
  const s = readFileSync(join(__dirname, "..", "app/page.tsx"), "utf8");
  assert.ok(!/emerald-400 animate-pulse/.test(s));
});
