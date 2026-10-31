// Member asks for a committee resolution (RESOLUTION_REQUESTS.sql, 31 Oct 2026). Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askName } from "../lib/letterTemplates";
import { fieldLabel, fillFields } from "../lib/letterFields";

const sql = readFileSync("RESOLUTION_REQUESTS.sql", "utf8");
const fmtSql = readFileSync("RESOLUTION_FORMAT.sql", "utf8");
const body = fmtSql.slice(fmtSql.indexOf("E'Managing") + 2, fmtSql.indexOf("', 60)")).replace(/''/g, "'").replace(/\\n/g, "\n");

test("members pick the request name, the committee issues the format's own name", () => {
  assert.equal(askName({ name: "Resolution for transfer of flat", request_name: "Request for transfer of flat" }), "Request for transfer of flat");
  assert.equal(askName({ name: "NOC for sale of flat", request_name: null }), "NOC for sale of flat");
  assert.equal(askName({ name: "NOC", request_name: "  " }), "NOC");
  assert.match(sql, /set request_name = 'Request for transfer of flat'/);
  assert.match(sql, /where name = 'Resolution for transfer of flat' and kind = 'resolution'/);
});

test("the member is asked for the new member's name; the rest the committee fills in", () => {
  assert.match(sql, /set member_fields = array\['transferee_name'\]/);
  assert.ok(fillFields(body).some((f) => f.key === "transferee_name"));
  assert.equal(fieldLabel("transferee_name"), "Transferee name");
});

test("SQL: only the format's fields are kept, an empty one is refused, the script re-runs and has an undo", () => {
  assert.match(sql, /foreach k in array tpl\.member_fields loop/);
  assert.match(sql, /left\(v, 200\)/);
  assert.match(sql, /raise exception 'Please fill in: %'/);
  assert.match(sql, /new\.details := clean/);
  assert.match(sql, /add column if not exists details jsonb/);
  assert.match(sql, /select 'new columns \(expect 3\)' as item/);
  assert.match(readFileSync("RESOLUTION_REQUESTS_UNDO.sql", "utf8"), /set member_fields = null, request_name = null/);
});

test("screens: member form shows the boxes and no 'addressed to'; the Chairman's issue opens with them filled", () => {
  const req = readFileSync("app/ledger/billing/LetterRequestPanel.tsx", "utf8");
  assert.match(req, /DETAILS FOR THE COMMITTEE/);
  assert.match(req, /row\.details = Object\.fromEntries/);
  assert.match(req, /\{!isRes && <div><span className="text-\[11px\] font-bold">ADDRESSED TO/);
  assert.match(req, /\(t\.request_name \|\| ""\)\.trim\(\)/);              // a resolution is asked for only when it has a request name
  const reg = readFileSync("app/ledger/billing/LettersRegister.tsx", "utf8");
  assert.match(reg, /templateId: t\.id, typed: r\.details \|\| \{\}/);
  const panel = readFileSync("app/ledger/billing/LettersPanel.tsx", "utf8");
  assert.match(panel, /pickFormat\(prefill\.templateId, prefill\.typed \|\| \{\}\)/);
  assert.match(panel, /setFmt\(null\); setTyped\(\{\}\); setEdited\(false\); await load\(\)/);   // next letter does not stay a resolution
});
