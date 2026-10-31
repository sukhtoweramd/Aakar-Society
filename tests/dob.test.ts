// Date of birth instead of age (DOB.sql, 31 Oct 2026). Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ageFromDob, ageOf, birthdayText, fullDob, isBirthdayOn, validDob } from "../lib/dob";
import { byFamilyOrder } from "../lib/society";

const on = new Date(2026, 9, 31); // 31 Oct 2026

test("age is worked out from the date of birth", () => {
  assert.equal(ageFromDob("1985-03-14", on), 41);
  assert.equal(ageFromDob("1985-10-31", on), 41);   // birthday today
  assert.equal(ageFromDob("1985-11-01", on), 40);   // tomorrow
  assert.equal(ageFromDob("", on), null);
  assert.equal(ageFromDob(null, on), null);
});

test("the old typed age is used only until a date of birth is entered", () => {
  assert.equal(ageOf({ age: 66, dob: null }, on), 66);
  assert.equal(ageOf({ age: 66, dob: "1980-01-01" }, on), 46);
  assert.equal(ageOf({}, on), null);
});

test("birthday text shows day and month, never the year", () => {
  assert.equal(birthdayText("1985-03-14"), "14 Mar");
  assert.equal(birthdayText(5, 12), "5 Dec");
  assert.equal(birthdayText(null, null), "");
  assert.equal(birthdayText(31, 13), "");
  assert.doesNotMatch(birthdayText("1985-03-14"), /1985/);
  assert.equal(fullDob("1985-03-14"), "14 Mar 1985");   // only the flat and the committee see this
});

test("only real dates, not in the future, not before 1900", () => {
  assert.equal(validDob("2026-10-31", on), true);
  assert.equal(validDob("2026-11-01", on), false);
  assert.equal(validDob("1899-12-31", on), false);
  assert.equal(validDob("2025-02-30", on), false);
  assert.equal(validDob("14/03/1985", on), false);
});

test("birthday today, including 29 Feb in a normal year", () => {
  assert.equal(isBirthdayOn("1985-10-31", "2026-10-31"), true);
  assert.equal(isBirthdayOn("1985-10-30", "2026-10-31"), false);
  assert.equal(isBirthdayOn("2000-02-29", "2027-02-28"), true);
  assert.equal(isBirthdayOn("2000-02-29", "2028-02-28"), false);
  assert.equal(isBirthdayOn("2000-02-29", "2028-02-29"), true);
});

test("family order still puts the head first, then the older one first", () => {
  const list = [{ name: "Kid", relation: "Son", dob: "2015-01-01" }, { name: "Mum", relation: "Mother", dob: "1950-01-01" }, { name: "Dad", relation: "Self", is_head: true, age: 40 }];
  assert.deepEqual([...list].sort(byFamilyOrder).map((m) => m.name)[0], "Dad");
  const sons = [{ name: "Young", relation: "Son", dob: "2015-01-01" }, { name: "Elder", relation: "Son", age: 30 }];
  assert.equal([...sons].sort(byFamilyOrder)[0].name, "Elder");
});

test("SQL: the directory carries day and month only, the script re-runs and has an undo", () => {
  const sql = readFileSync("DOB.sql", "utf8");
  assert.match(sql, /add column if not exists dob date/);
  assert.match(sql, /extract\(day from m\.dob\)::int as birth_day/);
  assert.match(sql, /extract\(month from m\.dob\)::int as birth_month/);
  assert.doesNotMatch(sql.slice(sql.indexOf("create or replace view"), sql.indexOf("revoke all")), /extract\(year|m\.dob as|birth_year/);
  assert.match(sql, /f\.directory_consent = true/);
  assert.match(sql, /select 'dob column' as item/);
  assert.match(readFileSync("DOB_UNDO.sql", "utf8"), /drop view if exists public\.member_directory/);
});

test("screens: the form explains that a date of birth shares the birthday, the directory shows birthday only", () => {
  const panel = readFileSync("app/ledger/MembersPanel.tsx", "utf8");
  assert.match(panel, /will be shown to all members and on the birthday banner/);
  assert.match(panel, /type="date"/);
  const dir = readFileSync("app/ledger/DirectoryTab.tsx", "utf8");
  assert.match(dir, /birthdayText\(m\.birth_day, m\.birth_month\)/);
  assert.doesNotMatch(dir, /\.dob\b/);
});
