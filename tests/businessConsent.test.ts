// Audit PR-13: the Business Directory lists a member only when the flat shares its details (or it is the viewer's own flat).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const up = readFileSync(join(root, "sql-security/13_BUSINESS_CONSENT.sql"), "utf8");
const undo = readFileSync(join(root, "sql-security/13_UNDO.sql"), "utf8");
const view = (sql: string) => sql.replace(/--.*$/gm, "");

test("new view requires directory consent or the viewer's own flat", () => {
  const v = view(up);
  assert.match(v, /create or replace view public\.business_directory with \(security_invoker = false\)/);
  assert.match(v, /f\.directory_consent = true or m\.flat_id = public\.my_flat\(\)/);
  assert.match(v, /revoke all on public\.business_directory from anon, public/);
  assert.match(v, /grant select on public\.business_directory to authenticated/);
});

test("new view keeps the same columns as before so the app code is unchanged", () => {
  const cols = "m.id, m.flat_id, m.name, m.occupation, m.business_name, m.business_category, m.office_address, m.office_phone, f.tower";
  assert.ok(view(up).includes(cols));
  assert.ok(view(undo).includes(cols));
});

test("undo restores the old unfiltered view and changes no data", () => {
  const u = view(undo);
  const viewOnly = u.split("select 'view checks")[0];   // the trailing check query may mention the word on purpose
  assert.doesNotMatch(viewOnly, /directory_consent/);
  assert.doesNotMatch(view(up) + u, /\b(delete|update|insert|drop table|truncate)\b/i);
});
