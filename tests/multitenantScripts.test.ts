// Multi-tenant step 2-3 (Nov 2026): MT_02 must give society_id to every backed-up table, and both scripts must use the same Aakar id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const mt02 = readFileSync(join(root, "multitenant/MT_02_SOCIETY_ID.sql"), "utf8");
const mt01 = readFileSync(join(root, "multitenant/MT_01_SOCIETIES.sql"), "utf8");

function listedTables(): string[] {
  const m = mt02.match(/tabs text\[\] := array\[([\s\S]*?)\];/);
  assert.ok(m, "table list not found in MT_02");
  return Array.from(m![1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
}

test("MT_02 covers every backed-up table, once", () => {
  const src = readFileSync(join(root, "lib/backup.ts"), "utf8");
  const b = src.match(/export const BACKUP_TABLES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(b);
  const backed = Array.from(b![1].matchAll(/"([a-z_]+)"/g), (x) => x[1]);
  const listed = listedTables();
  assert.deepEqual(backed.filter((t) => !listed.includes(t)), [], "backed-up table without society_id in MT_02");
  assert.equal(new Set(listed).size, listed.length, "duplicate table in MT_02");
  assert.ok(!listed.includes("zz_security_app_meta_backup"));
});

test("MT_01 and MT_02 use the same Aakar id", () => {
  const id = /a4a4a4a4-0000-4000-8000-000000000001/;
  assert.match(mt01, id);
  assert.match(mt02, id);
});

// Step 4c-1: numbers and names unique per society (MT_05).
const mt05 = readFileSync(join(root, "multitenant/MT_05_PER_SOCIETY_UNIQUE.sql"), "utf8");
const mt05undo = readFileSync(join(root, "multitenant/MT_05_UNDO.sql"), "utf8");

test("MT_05 makes every number per society, and has an undo and a test", () => {
  for (const pair of ["'bills','bill_no'", "'payments','receipt_no'", "'letters','ref_no'", "'complaints','complaint_no'",
    "'booking_areas','name'", "'letter_templates','name'", "'flats','flat_no'", "'flats','edit_code'"]) {
    assert.ok(mt05.includes(pair), `MT_05 does not cover ${pair}`);
    assert.ok(mt05undo.includes(pair), `MT_05_UNDO does not cover ${pair}`);
  }
  assert.match(mt05, /unique \(society_id, %I\)/);
  assert.match(mt05, /on public\.bills \(society_id, flat_id, period_from\)/);
  assert.match(mt05, /on public\.flat_tenant_logins \(society_id, flat_id\) where active/);
  assert.match(mt05, /c\.society_id = new\.society_id/, "complaint numbers must be counted inside the society");
  assert.doesNotMatch(mt05undo, /society_id = new\.society_id/, "the undo restores the old complaint trigger");
  readFileSync(join(root, "multitenant/MT_05_TEST.sql"), "utf8");
});

// Step 4c-2: the one-row settings tables per society (MT_06).
const mt06 = readFileSync(join(root, "multitenant/MT_06_SETTINGS_PER_SOCIETY.sql"), "utf8");
const mt06undo = readFileSync(join(root, "multitenant/MT_06_UNDO.sql"), "utf8");

test("MT_06 keys the five settings tables by society and rewrites the 'where id = 1' functions", () => {
  for (const t of ["billing_settings", "app_settings", "society_profile", "help_guide", "society_live"]) {
    assert.ok(mt06.includes(`'${t}'`), `MT_06 does not cover ${t}`);
    assert.ok(mt06undo.includes(`'${t}'`), `MT_06_UNDO does not cover ${t}`);
  }
  assert.match(mt06, /primary key \(society_id, id\)/);
  assert.match(mt06, /where society_id = public\.current_society_or_first\(\) and id = 1/);
  assert.match(mt06undo, /primary key \(id\)/);
  readFileSync(join(root, "multitenant/MT_06_TEST.sql"), "utf8");
});

test("the society profile is saved without an upsert on id (the key is (society_id, id) after MT_06)", () => {
  const src = readFileSync(join(root, "app/ledger/SetupEditors.tsx"), "utf8");
  assert.doesNotMatch(src, /onConflict:\s*"id"/);
});

// Step 4c-3: flat ids, tower codes and nomination rows per society (MT_07).
const mt07 = readFileSync(join(root, "multitenant/MT_07_FLAT_KEYS.sql"), "utf8");
const mt07undo = readFileSync(join(root, "multitenant/MT_07_UNDO.sql"), "utf8");

test("MT_07 keys flats / towers / nomination_status by society, remakes the links and rewrites the two functions", () => {
  assert.match(mt07, /primary key \(society_id, id\)/);
  assert.match(mt07, /FOREIGN KEY \(society_id, \\1\)/);
  assert.match(mt07, /flats\(society_id, id\)/);
  assert.match(mt07, /'towers', 'code'/);
  assert.match(mt07, /'nomination_status', 'flat_id'/);
  assert.match(mt07, /on conflict \(society_id, flat_id\)/, "nominees_changed must conflict on the new key");
  assert.match(mt07, /f\.society_id = old\.society_id/, "towers_guard must count the society's own flats");
  assert.match(mt07, /drop constraint if exists flats_tower_check/);
  assert.match(mt07undo, /primary key \(id\)/);
  assert.match(mt07undo, /flats_tower_check/);
  readFileSync(join(root, "multitenant/MT_07_TEST.sql"), "utf8");
});

test("the nomination 'form received' button saves without an upsert (the key is (society_id, flat_id) after MT_07)", () => {
  const src = readFileSync(join(root, "app/ledger/NomineePanel.tsx"), "utf8");
  assert.doesNotMatch(src, /nomination_status"\)\s*\.upsert/);
});

// Step 4c-4: the society_id default is the login's society (MT_08).
const mt08 = readFileSync(join(root, "multitenant/MT_08_SOCIETY_DEFAULT.sql"), "utf8");
const mt08undo = readFileSync(join(root, "multitenant/MT_08_UNDO.sql"), "utf8");

test("MT_08 changes the society_id default on every MT_02 table, and the undo puts Aakar's id back", () => {
  const list = (s: string) => {
    const m = s.match(/tabs text\[\] := array\[([\s\S]*?)\];/);
    assert.ok(m, "table list not found");
    return Array.from(m![1].matchAll(/'([a-z_]+)'/g), (x) => x[1]);
  };
  assert.deepEqual(list(mt08), listedTables(), "MT_08 must cover exactly the tables of MT_02");
  assert.deepEqual(list(mt08undo), listedTables(), "MT_08_UNDO must cover exactly the tables of MT_02");
  assert.match(mt08, /set default public\.current_society_or_first\(\)/);
  assert.match(mt08, /Run MT_06/, "MT_08 needs the MT_06 helper and must say so");
  assert.doesNotMatch(mt08, /set default %L/, "the new default must not be a fixed id (the check query may still name Aakar to count leftovers)");
  assert.match(mt08undo, /a4a4a4a4-0000-4000-8000-000000000001/);
  assert.match(mt02, /current_society_or_first/, "the MT_02 check must accept the MT_08 default too");
  readFileSync(join(root, "multitenant/MT_08_TEST.sql"), "utf8");
});

// Step 4d-1: clearing test documents and restoring a backup act on one society (MT_09).
const mt09 = readFileSync(join(root, "multitenant/MT_09_BACKUP_CLEAR_SCOPE.sql"), "utf8");
const mt09undo = readFileSync(join(root, "multitenant/MT_09_UNDO.sql"), "utf8");

test("MT_09 scopes clear_test_documents and restore_society_backup to one society, keeps them closed to members, and can be undone", () => {
  for (const fn of ["clear_test_documents", "restore_society_backup"]) {
    assert.ok(mt09.includes(fn), `MT_09 does not cover ${fn}`);
    assert.ok(mt09undo.includes(fn), `MT_09_UNDO does not cover ${fn}`);
  }
  assert.match(mt09, /p_society uuid DEFAULT NULL::uuid/, "the society is an optional last argument (the 4-argument call keeps meaning Aakar)");
  assert.match(mt09, /where society_id = v_society/);
  assert.match(mt09, /select %L::uuid/, "restored rows are written with the society's id, never the file's");
  assert.match(mt09, /a\.attname <> ''society_id''/, "a society_id inside a backup file is ignored");
  assert.match(mt09, /revoke all on function public\.clear_test_documents\(integer, integer, integer, integer, uuid\) from public, anon, authenticated/);
  assert.match(mt09, /revoke all on function public\.restore_society_backup\(jsonb, uuid\) from public, anon, authenticated/);
  assert.match(mt09, /on conflict \(fn\) do update/, "the saved original must always be refreshed while the old form is present");
  assert.match(mt09, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.doesNotMatch(mt09, /chr\(10\)/, "the script must not depend on a fixed line break (a function pasted from Windows has CR + LF)");
  assert.match(mt09undo, /zz_mt09_function_backup/);
  readFileSync(join(root, "multitenant/MT_09_TEST.sql"), "utf8");
});

// Step 4d-2: the three directory views show only the society of the login that is asking (MT_10).
const mt10 = readFileSync(join(root, "multitenant/MT_10_DIRECTORY_VIEWS.sql"), "utf8");
const mt10undo = readFileSync(join(root, "multitenant/MT_10_UNDO.sql"), "utf8");
const mt10test = readFileSync(join(root, "multitenant/MT_10_TEST.sql"), "utf8");

test("MT_10 rebuilds the three directory views for the caller's society, joins on (society, flat id), and can be undone", () => {
  for (const v of ["flat_directory", "member_directory", "business_directory"]) {
    assert.match(mt10, new RegExp(`create or replace view public\\.${v} with \\(security_invoker = false\\)`), `${v} stays an owner-rights view`);
    assert.ok(mt10undo.includes("zz_mt10_view_backup") && mt10.includes(`'${v}'`), `${v} is saved for the undo`);
  }
  assert.equal((mt10.match(/\(select public\.active_society\(\)\)/g) || []).length, 3, "each view filters by the login's society");
  assert.match(mt10, /m\.society_id = f\.society_id and m\.flat_id = f\.id/, "member_directory joins members on (society, flat id)");
  assert.match(mt10, /f\.society_id = m\.society_id and f\.id = m\.flat_id/, "business_directory joins flats on (society, flat id)");
  assert.doesNotMatch(mt10, /on m\.flat_id = f\.id|on f\.id = m\.flat_id/, "never join on the flat id alone");
  assert.match(mt10, /if d !~ 'active_society' then/, "only the ORIGINAL view text is saved, so a re-run cannot overwrite it");
  assert.match(mt10, /nothing was changed\. Send me its text/, "an unexpected column list stops the script");
  assert.match(mt10, /revoke all on public\.flat_directory, public\.member_directory, public\.business_directory from anon, public/);
  assert.match(mt10, /Run MT_03/, "needs active_society() and says so");
  assert.match(mt10test, /raise exception E'RESULT/, "the test ends with a deliberate error so everything is rolled back");
  assert.doesNotMatch(mt10, /\bdrop view\b/i, "views are replaced in place so their grants stay");
});

// Step 4d-3: the functions that look a flat / bill / the committee up do it in the LOGIN'S society (MT_11).
const mt11 = readFileSync(join(root, "multitenant/MT_11_FLAT_LOOKUPS.sql"), "utf8");
const mt11undo = readFileSync(join(root, "multitenant/MT_11_UNDO.sql"), "utf8");
const mt11test = readFileSync(join(root, "multitenant/MT_11_TEST.sql"), "utf8");

test("MT_11 rewrites the flat-lookup functions from their live text, saves the originals, refuses unknown forms, and can be undone", () => {
  for (const f of ["flat_is_rented", "flat_has_tenant_login", "my_tenant_flat", "can_assign_areas", "area_rights", "can_approve_letters",
                   "can_approve_booking", "my_flat_is_committee", "committee_people", "flat_people_counts", "bill_is_tenant", "flat_blockers"]) {
    assert.ok(mt11.includes(`public.${f}(`) , `${f} is rewritten`);
    assert.ok(mt11undo.includes("zz_mt11_function_backup"), "the undo reads the saved copy");
  }
  assert.match(mt11, /pg_get_functiondef\(s::regprocedure\)/, "rewritten from the live text");
  assert.match(mt11, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.match(mt11, /if d !~\* 'active_society' and d !~\* 'p_society' then/, "only the ORIGINAL text is saved, so a re-run cannot overwrite it");
  assert.match(mt11, /case when s = 'public\.can_approve_booking\(\)' then 2 else 1 end/, "can_approve_booking has two flat lookups and both are filtered");
  assert.match(mt11, /join public\.flats f on f\.society_id = t\.society_id and f\.id = t\.flat_id/, "tenant login joins its flat in the same society");
  assert.match(mt11, /m\.society_id = \(select public\.active_society\(\)\) and \(public\.is_committee\(\) or exists \(/, "the old A-or-B is bracketed under the society filter");
  assert.match(mt11, /a\.attname <> ''society_id''/, "flat_blockers skips the society_id column of the composite foreign keys");
  assert.match(mt11, /p_society uuid DEFAULT NULL::uuid/, "flat_blockers takes a society; left out = the first society's (server key, no login)");
  assert.match(mt11, /revoke all on function public\.flat_blockers\(text\[\], uuid\) from public, anon, authenticated/);
  assert.match(mt11, /grant execute on function public\.flat_blockers\(text\[\], uuid\) to service_role/);
  assert.match(mt11, /Run MT_03/, "needs active_society() and says so");
  assert.doesNotMatch(mt11, /chr\(10\)/, "the script must not depend on a fixed line break (a function pasted from Windows has CR + LF)");
  assert.doesNotMatch(mt11, /\bdrop function public\.(?!flat_blockers)/i, "only the old one-argument flat_blockers is dropped");
  assert.doesNotMatch(mt11, /\b(insert into|update|delete from) public\.(?!zz_mt11)/i, "changes no table and no data");
  assert.match(mt11undo, /drop function public\.flat_blockers\(text\[\], uuid\)/);
  assert.match(mt11test, /raise exception E'RESULT/, "the test ends with a deliberate error so everything is rolled back");
  assert.match(mt11test, /NEVER run it on Aakar/, "the test says it is for the test project only");
});

// Step 4d-4: the five booking actions act only in the LOGIN'S society (MT_12).
const mt12 = readFileSync(join(root, "multitenant/MT_12_BOOKING_ACTIONS.sql"), "utf8");
const mt12undo = readFileSync(join(root, "multitenant/MT_12_UNDO.sql"), "utf8");
const mt12test = readFileSync(join(root, "multitenant/MT_12_TEST.sql"), "utf8");

test("MT_12 rewrites the booking actions from their live text, saves the originals, refuses unknown forms, and can be undone", () => {
  for (const f of ["booked_slots", "cancel_booking", "decide_booking", "request_booking", "set_booking_charge"]) {
    assert.ok(mt12.includes(`public.${f}(`) || mt12.includes(`'${f}'`) || mt12.includes(f), `${f} is rewritten`);
  }
  assert.match(mt12, /pg_get_functiondef\(/, "rewritten from the live text");
  assert.match(mt12, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.match(mt12, /zz_mt12_function_backup/, "the originals are saved for the undo");
  assert.match(mt12, /MT_11/, "needs MT_11 first and says so");
  assert.match(mt12, /b\.society_id/, "decide_booking takes the society from the booking itself, not from the fallback");
  assert.doesNotMatch(mt12, /\bdrop function\b/i, "functions are replaced in place so their grants stay");
  assert.doesNotMatch(mt12, /^\s*(delete from|update) public\./im, "changes no table and no data (the insert texts in the script are only patterns for the function text)");
  assert.match(mt12undo, /zz_mt12_function_backup/, "the undo reads the saved copy");
  assert.match(mt12test, /raise exception E'RESULT/, "the test ends with a deliberate error so everything is rolled back");
  assert.match(mt12test, /NEVER run it on Aakar/, "the test says it is for the test project only");
});

// Step 4d-5: the eight event actions act only in the LOGIN'S society (MT_13).
const mt13 = readFileSync(join(root, "multitenant/MT_13_EVENT_ACTIONS.sql"), "utf8");
const mt13undo = readFileSync(join(root, "multitenant/MT_13_UNDO.sql"), "utf8");
const mt13test = readFileSync(join(root, "multitenant/MT_13_TEST.sql"), "utf8");

test("MT_13 rewrites the event actions from their live text, saves the originals, refuses unknown forms, and can be undone", () => {
  for (const f of ["my_event_role", "gate_pass", "gate_undo", "register_for_event", "set_event_money_settings", "set_event_registration", "submit_event_payment", "verify_event_payment"]) {
    assert.ok(mt13.includes(`public.${f}(`), `${f} is rewritten`);
  }
  assert.match(mt13, /pg_get_functiondef\(/, "rewritten from the live text");
  assert.match(mt13, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.match(mt13, /zz_mt13_function_backup/, "the originals are saved for the undo");
  assert.match(mt13, /MT_11/, "needs MT_11 first and says so");
  assert.match(mt13, /where t\.society_id = \(select public\.active_society\(\)\) and t\.event_id = p_event and/, "the team role is looked up in the login's society");
  assert.match(mt13, /where f\.society_id = r\.society_id and f\.id = r\.cash_to/, "the cash taker's flat is looked up in the registration's society");
  assert.match(mt13, /Event not found\./, "another society's event gives a clear message, not a quiet no-op");
  assert.doesNotMatch(mt13, /\bdrop function\b/i, "functions are replaced in place so their grants stay");
  assert.doesNotMatch(mt13, /^\s*(delete from|update) public\./im, "changes no table and no data (the insert texts in the script are only patterns for the function text)");
  assert.match(mt13undo, /zz_mt13_function_backup/, "the undo reads the saved copy");
  assert.match(mt13test, /raise exception E'RESULT/, "the test ends with a deliberate error so everything is rolled back");
  assert.match(mt13test, /NEVER run it on Aakar/, "the test says it is for the test project only");
});

// Step 4d-6: the eight complaint / letter-request / meeting / payment-reference actions act only in the LOGIN'S society (MT_14).
const mt14 = readFileSync(join(root, "multitenant/MT_14_COMPLAINT_LETTER_ACTIONS.sql"), "utf8");
const mt14undo = readFileSync(join(root, "multitenant/MT_14_UNDO.sql"), "utf8");
const mt14test = readFileSync(join(root, "multitenant/MT_14_TEST.sql"), "utf8");

test("MT_14 rewrites the complaint, letter, meeting and reference actions from their live text, saves the originals, refuses unknown forms, and can be undone", () => {
  for (const f of ["mark_my_action_done", "my_action_points", "my_committee_meetings", "my_meeting", "reassign_complaint", "update_complaint", "utr_already_reported", "withdraw_letter_request"]) {
    assert.ok(mt14.includes(`public.${f}(`), `${f} is rewritten`);
  }
  assert.match(mt14, /pg_get_functiondef\(/, "rewritten from the live text");
  assert.match(mt14, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.match(mt14, /zz_mt14_function_backup/, "the originals are saved for the undo");
  assert.match(mt14, /MT_11/, "needs MT_11 first and says so");
  assert.match(mt14, /pr\.society_id = \(select public\.active_society\(\)\)/, "the payment reference check looks in the login's society only");
  assert.match(mt14, /m0\.society_id = \(select public\.active_society\(\)\)/, "a committee login of another society gets no meeting");
  assert.match(mt14, /storage_stats\(\)[^\n]*\n?[^\n]*on purpose|NOT changed on purpose: storage_stats/, "storage_stats is left alone on purpose and the script says so");
  assert.doesNotMatch(mt14, /\bdrop function\b/i, "functions are replaced in place so their grants stay");
  assert.doesNotMatch(mt14, /^\s*(delete from|update) public\./im, "changes no table and no data");
  assert.match(mt14undo, /zz_mt14_function_backup/, "the undo reads the saved copy");
  assert.match(mt14test, /raise exception E'RESULT/, "the test ends with a deliberate error so everything is rolled back");
  assert.match(mt14test, /NEVER run it on Aakar/, "the test says it is for the test project only");
});

// Step 4d-7: three trigger functions look only at rows of the ROW'S society (MT_15, group D).
const mt15 = readFileSync(join(root, "multitenant/MT_15_TRIGGERS.sql"), "utf8");
const mt15undo = readFileSync(join(root, "multitenant/MT_15_UNDO.sql"), "utf8");
const mt15test = readFileSync(join(root, "multitenant/MT_15_TEST.sql"), "utf8");

test("MT_15 rewrites the three trigger functions from their live text, saves the originals, refuses unknown forms, and can be undone", () => {
  for (const f of ["tenant_moved_out", "committee_areas_guard", "letter_request_before_insert"]) {
    assert.ok(mt15.includes(`public.${f}()`), `${f} is rewritten`);
  }
  assert.match(mt15, /pg_get_functiondef\(/, "rewritten from the live text");
  assert.match(mt15, /unexpected form \(%\); nothing was changed/, "an unknown function text stops the script and says which check failed");
  assert.match(mt15, /zz_mt15_function_backup/, "the originals are saved for the undo");
  assert.match(mt15, /MT_11/, "needs MT_11 first and says so");
  assert.match(mt15, /where society_id = new\.society_id and flat_id = new\.id and active/, "a tenant moving out switches off only this society's tenant login");
  assert.match(mt15, /f\.society_id = new\.society_id and f\.id = x and f\.is_committee/, "the committee check looks in the area's society");
  assert.match(mt15, /letter_templates where society_id = new\.society_id and id = new\.template_id/, "the letter format is looked up in the request's society");
  assert.match(mt15, /NOT changed on purpose/, "the three untouched trigger functions are named with the reason");
  assert.doesNotMatch(mt15, /\bdrop (function|trigger)\b/i, "functions are replaced in place so the triggers stay attached");
  assert.doesNotMatch(mt15, /^\s*(delete from|update) public\./im, "changes no table and no data");
  assert.match(mt15undo, /zz_mt15_function_backup/, "the undo reads the saved copy");
  assert.match(mt15test, /raise exception E'RESULT/, "the test ends with a deliberate error so everything is rolled back");
  assert.match(mt15test, /NEVER run it on Aakar/, "the test says it is for the test project only");
});
