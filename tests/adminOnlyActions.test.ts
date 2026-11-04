// PR-15: removing a flat login, revoking a tenant login, creating many flat logins at once and clearing a whole
// family are main admin only. The server decides (the screens only hide the buttons).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const residents = read("app/api/residents/route.ts");
const family = read("app/api/flat-family/route.ts");

test("residents route: remove, tenant_revoke and bulk create need the main admin, checked before the action runs", () => {
  assert.match(residents, /\["remove", "tenant_revoke"\]\.includes\(action\) \|\| manyAtOnce/);
  assert.match(residents, /manyAtOnce = action === "create" && Array\.isArray\(body\.flats\) && body\.flats\.length > 1/);
  const guard = residents.indexOf("isMainAdminUser(admin, me.userId)");
  assert.ok(guard > 0 && guard < residents.indexOf("tenantAction(action, body, admin, me)"));
  assert.ok(guard < residents.indexOf('if (action === "create")'));
  assert.match(residents, /refused_/);
});

test("residents route: creating ONE flat login and resetting a password stay open to the committee", () => {
  const guardLine = residents.match(/\["remove", "tenant_revoke"\]/g) || [];
  assert.equal(guardLine.length, 1);
  assert.ok(!/"reset"[^\n]*isMainAdminUser/.test(residents));
  assert.ok(!/tenant_reset|tenant_create/.test(residents.slice(residents.indexOf("manyAtOnce ="), residents.indexOf("manyAtOnce =") + 250)));
});

test("clearing a whole family: server route checks the main admin before deleting anything", () => {
  const guard = family.indexOf("isMainAdminUser(admin, me.userId)");
  assert.ok(guard > 0);
  for (const t of ['"vehicles"', '"emergency_contacts"', 'from("members").delete()']) assert.ok(guard < family.indexOf(t), t);
  assert.match(family, /status: 403/);
  assert.match(family, /refused_clear_family/);
});

test("the family screen no longer deletes in bulk from the browser", () => {
  const d = read("app/ledger/DetailTab.tsx");
  assert.ok(!/from\("members"\)\.delete\(\)\.eq\("flat_id"/.test(d));
  assert.ok(!/from\(t\)\.delete\(\)\.eq\("flat_id"/.test(d));
  assert.match(d, /api\/flat-family/);
});

test("the buttons are hidden for other committee logins", () => {
  assert.match(read("app/ledger/LoginsPanel.tsx"), /isMain && <button onClick=\{\(\) => remove\(f\.id\)\}/);
  assert.match(read("app/ledger/LoginsPanel.tsx"), /\{isMain && <button onClick=\{\(\) => create\(missing\)\}/);
  assert.match(read("app/ledger/TenantLoginCard.tsx"), /info\?\.active && isMain && <button[^\n]*tenant_revoke/);
});
