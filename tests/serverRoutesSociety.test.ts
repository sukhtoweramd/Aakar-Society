// Multi-tenant step 4d-3: routes that use the server key (it skips the database wall) must name the society in every query,
// and must not list every login of the project. Source checks, like the other route tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const ROUTES = ["app/api/flat-family/route.ts", "app/api/flat-plan/route.ts", "app/api/residents/route.ts", "app/api/committee/route.ts"];

test("every server-key table query in these routes names the society", () => {
  for (const f of ROUTES) {
    const lines = read(f).split("\n");
    lines.forEach((line, i) => {
      if (!/\badmin\.from\(/.test(line) && !/\bg\.admin\.from\(/.test(line)) return;
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/from\("society_memberships"\)/.test(line)) return;   // platform table: keyed by login, no society column filter needed
      assert.ok(/society_id|society\b/.test(line), `${f}:${i + 1} reads or writes a table without naming the society: ${line.trim().slice(0, 90)}`);
    });
  }
});

test("no route lists every login of the project itself", () => {
  for (const f of ROUTES) assert.ok(!/auth\.admin\.listUsers/.test(read(f)), f + " lists all logins; use societyUsers / societyCommittee (lib/mainAdmin.ts)");
});

test("residents: resident and tenant logins come from the caller's society", () => {
  const t = read("app/api/residents/route.ts");
  assert.match(t, /societyUsers\(admin, society\)/);
  assert.match(t, /residentUsers\(g\.admin, society\)/);
  assert.match(t, /tenantUsers\(g\.admin, society\)/);
  assert.match(t, /insert\(\{ society_id: society, user_id/);
});

test("flat-plan: the flats it inserts carry the society", () => {
  assert.match(read("app/api/flat-plan/route.ts"), /\.map\(\(p\) => \(\{ \.\.\.p, society_id: society \}\)\)/);
});

test("access log rows always name the society (logAccess needs it; the server key skips the login's default)", () => {
  const b = read("lib/backup.ts");
  assert.match(b, /export async function logAccess\(admin: SupabaseClient, actor: string, action: string, target: string, details: string, society: string\)/);
  assert.match(b, /insert\(\[\{ actor, action, target, details, society_id: society \}\]\)/);
});
