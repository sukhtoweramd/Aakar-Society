// Committee resolution as a letter format (RESOLUTION_FORMAT.sql, 31 Oct 2026). Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customData, fieldsIn, fillFields, amountText, longDate, wordsOf } from "../lib/letterFields";
import { fillTemplate, letterData } from "../lib/letterTemplates";
import { inWords } from "../lib/words";

const sql = readFileSync("RESOLUTION_FORMAT.sql", "utf8");
const body = sql.slice(sql.indexOf("E'Managing") + 2, sql.indexOf("', 60)")).replace(/''/g, "'").replace(/\\n/g, "\n");
const flat = { id: "A101", tower: "A", floor: 1, owner_name: "SAMPLE SELLER", share_cert_no: "123", member_since: "2001-04-01" };
const known = letterData(flat, { society: "SAMPLE SOCIETY", building: "SAMPLE TOWER", date: "2026-11-02" });

test("the society's wording is kept, with its blanks as fields", () => {
  assert.match(body, /^Managing Committee Meeting Date: \{\{meeting_date\}\}\nResolution No\.: \{\{resolution_no\}\}/);
  assert.match(body, /RESOLVED THAT the transfer of Flat No\. \{\{flat_no\}\}, along with the associated membership and shares of the Society/);
  assert.match(body, /RESOLVED FURTHER THAT the Secretary of the Society is hereby authorised to update the membership register/);
  assert.match(body, /recorded in the minutes of the Managing Committee meeting and the Society's books of accounts\.”$/);
});

test("boxes to fill in: what the records do not know; owner, flat and words need no box", () => {
  assert.deepEqual(fillFields(body).map((f) => f.key), ["meeting_date", "resolution_no", "transferee_name", "fee_amount", "receipt_no", "receipt_date"]);
  assert.deepEqual(fillFields(body).map((f) => f.kind), ["date", "text", "text", "amount", "text", "date"]);
  assert.ok(fieldsIn(body).includes("fee_words") && fieldsIn(body).includes("owner_name"));
});

test("filled resolution: fee in figures and words, dates, names", () => {
  const typed = { meeting_date: "2026-11-02", resolution_no: "7/2026", transferee_name: "SAMPLE BUYER", fee_amount: "25000", receipt_no: "AKR/R/0042", receipt_date: "2026-11-01" };
  const t = fillTemplate(body, { ...known, ...customData(body, typed) });
  assert.match(t, /Meeting Date: 2 November 2026\nResolution No\.: 7\/2026/);
  assert.match(t, /existing member, Mr\.\/Mrs\. SAMPLE SELLER, for the transfer of Flat No\. A-101 to Mr\.\/Mrs\. SAMPLE BUYER\./);
  assert.match(t, /transfer fee of ₹25,000 \(Rupees Twenty-Five Thousand only\) has been received by the Society vide Receipt No\. AKR\/R\/0042 dated 1 November 2026\./);
  assert.doesNotMatch(t, /\{\{|______/);
});

test("empty boxes stay visible as blanks to fill by hand", () => {
  const t = fillTemplate(body, { ...known, ...customData(body, {}) });
  assert.match(t, /Meeting Date: ______\nResolution No\.: ______/);
  assert.match(t, /transfer fee of ₹______ \(Rupees ______ only\)/);
});

test("amounts and dates", () => {
  assert.equal(amountText("1250000"), "12,50,000");
  assert.equal(amountText("12,500.50"), "12,500.5");
  assert.equal(amountText("abc"), "");
  assert.equal(wordsOf("12500"), "Twelve Thousand Five Hundred");
  assert.equal(wordsOf("0"), "");
  assert.equal(longDate("2026-03-04"), "4 March 2026");
  assert.equal(longDate("04/03/2026"), "");
  assert.equal(inWords(21000), "Rupees Twenty-One Thousand Only");
});

test("SQL: only Chairman / Secretary issue a resolution, the script re-runs and has an undo", () => {
  assert.match(sql, /new\.layout = 'resolution' and auth\.uid\(\) is not null and not public\.can_approve_letters\(\)/);
  assert.match(sql, /before insert or update of layout on public\.letters/);
  assert.match(sql, /kind in \('general', 'bank', 'resolution'\)/);
  assert.match(sql, /on conflict \(name\) do nothing/);
  assert.match(sql, /select 'resolution kind allowed' as item/);
  assert.match(readFileSync("RESOLUTION_FORMAT_UNDO.sql", "utf8"), /drop trigger if exists letters_resolution_guard/);
});

test("screens: committee issues it from a format, members cannot ask for it, print has the signature table", () => {
  const panel = readFileSync("app/ledger/billing/LettersPanel.tsx", "utf8");
  assert.match(panel, /START FROM A FORMAT/);
  assert.match(panel, /formats\.filter\(\(t\) => t\.kind !== "resolution" \|\| canApprove\)/);
  assert.match(panel, /can_approve_letters/);
  assert.match(panel, /owner_name: owner \|\| flat\.owner_name/);          // the existing member comes from the OWNER NAME box (joint owners can be corrected)
  assert.match(panel, /Existing member \(transferor\)/);
  assert.match(readFileSync("app/ledger/billing/LetterRequestPanel.tsx", "utf8"), /t\.kind !== "resolution" \|\| \(t\.request_name/);
  const billing = readFileSync("lib/billing.ts", "utf8");
  assert.match(billing, /if \(l\.layout === "resolution"\) return resolutionHtml\(l, c\)/);
  for (const w of ["Chairman", "Secretary", "Committee Member", "Name and Signature"]) assert.ok(billing.includes(w));
});
