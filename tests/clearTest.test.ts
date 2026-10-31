// CLEAR TEST DOCUMENTS before GO LIVE (31 Oct 2026): what is cleared and what is kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEPT_FILE_FOLDERS, TEST_FILE_FOLDERS } from "../lib/testClear";

const sql = readFileSync("sql-security/12_CLEAR_TEST_ALL.sql", "utf8");
const fnAll = sql.slice(sql.indexOf("create or replace function"), sql.indexOf("end $$;"));
// the list of tables the function empties
const fn = fnAll.slice(fnAll.indexOf("tabs text[] := array["), fnAll.indexOf("];", fnAll.indexOf("tabs text[] := array[")));

test("clears all test activity tables", () => {
  for (const t of ["payment_reports", "payments", "bills", "letter_requests", "letters", "event_checkins", "event_registrations",
    "event_money", "event_team", "meeting_actions", "meetings", "events", "complaints", "bookings", "notices", "amc_visits",
    "amc_contracts", "nominees", "nomination_status"]) assert.match(fn, new RegExp(`'${t}'`), t);
});

test("never clears setup data", () => {
  for (const t of ["flats", "members", "vehicles", "emergency_contacts", "flat_docs", "businesses", "committee_areas",
    "society_contacts", "booking_areas", "letter_templates", "signatories", "billing_settings", "flat_tenant_logins", "help_guide", "maintenance"]) {
    assert.doesNotMatch(fn, new RegExp(`'${t}'`), t);
  }
});

test("children are cleared before their parents", () => {
  const order = (a: string, b: string) => assert.ok(fn.indexOf(`'${a}'`) < fn.indexOf(`'${b}'`), `${a} before ${b}`);
  order("payments", "bills"); order("payment_reports", "bills"); order("letter_requests", "letters");
  order("meeting_actions", "meetings"); order("meetings", "events"); order("event_team", "events"); order("amc_visits", "amc_contracts");
});

test("still locked after GO LIVE and server-only", () => {
  assert.match(fnAll, /society_live\) then raise exception/);
  assert.match(sql, /revoke all on function public\.clear_test_documents\(int, int, int, int\) from public, anon, authenticated/);
});

test("test files folders never include flat documents, vault, floor plans or backups", () => {
  for (const k of KEPT_FILE_FOLDERS) assert.ok(!TEST_FILE_FOLDERS.some((f) => f.startsWith(k) || k.startsWith(f)), k);
  for (const f of TEST_FILE_FOLDERS) assert.ok(f.endsWith("/"), f);
});
