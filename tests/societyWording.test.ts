// Society wording on printed papers and screens (19 Nov 2026): taken from the society profile, Aakar's output unchanged. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOCIETY, fileSlug, siteUrl, societyAppName, societyShort, addressOneLine, addressWithPin, nameLines, nameSuffix, regYear, societyPin, societyTitle, titleCase } from "../lib/society";
import { noticeText, invoiceText } from "../lib/bookings";
import { waNewText, waDoneText } from "../lib/complaints";
import { applySocietyProfile, FALLBACK_PROFILE, profileFromRow } from "../lib/societySetup";

test("Aakar: every helper gives exactly the wording that used to be typed into the code", () => {
  assert.equal(titleCase(SOCIETY.name), "Aakar Co-op");
  assert.equal(societyTitle(), "Aakar Co-op Housing Society Ltd.");
  assert.equal(addressOneLine(), "Mirambica Road, Naranpura, Ahmedabad – 380013");
  assert.equal(addressWithPin(), "Sukh Tower, Mirambica Road, Naranpura, Ahmedabad – 380013");
  assert.equal(societyPin(), "380013");
  assert.equal(regYear(), "1994");
  assert.deepEqual(nameLines(SOCIETY.name), ["AAKAR", "CO-OP"]);
  assert.equal(nameSuffix(), "HOUSING SOCIETY LTD.");
  assert.equal(titleCase(SOCIETY.building), "Sukh Tower");
});

test("another society: the wording follows its profile", () => {
  try {
    applySocietyProfile(profileFromRow({ name: "GREEN VIEW", full_name: "GREEN VIEW CHS LTD.", reg_no: "SRT-77", reg_date: "2001-05-02", building: "GREEN TOWER",
      address: "Green Tower, Ring Road, Surat", address_lines: ["Ring Road", "Surat - 395002"], city: "Surat" }));
    assert.equal(societyTitle(), "Green View Chs Ltd.");
    assert.equal(addressOneLine(), "Ring Road, Surat – 395002");
    assert.equal(addressWithPin(), "Green Tower, Ring Road, Surat – 395002");
    assert.equal(regYear(), "2001");
    assert.deepEqual(nameLines(SOCIETY.name), ["GREEN", "VIEW"]);
    assert.equal(nameSuffix(), "CHS LTD.");
  } finally { applySocietyProfile(FALLBACK_PROFILE); }
});

test("edge cases: one-word name, no pin code, no registration date", () => {
  try {
    applySocietyProfile(profileFromRow({ name: "SUNRISE", full_name: "SUNRISE APARTMENTS", reg_no: "", reg_date: "", building: "", address: "Main Road", address_lines: ["Main Road"], city: "Pune" }));
    assert.deepEqual(nameLines(SOCIETY.name), ["SUNRISE", ""]);
    assert.equal(nameSuffix(), "APARTMENTS");
    assert.equal(societyPin(), "");
    assert.equal(addressWithPin(), "Main Road");
    assert.equal(regYear(), "");
  } finally { applySocietyProfile(FALLBACK_PROFILE); }
});

test("no Aakar wording typed into printed papers, the login and cover screens, or the stamp", () => {
  const files = ["lib/billing.ts", "lib/flatCard.ts", "lib/eventReg.ts", "app/ledger/Login.tsx", "app/ledger/CoverTab.tsx", "app/ledger/NomineePanel.tsx",
    "app/ledger/VehicleReport.tsx", "app/ledger/DirectoryTab.tsx", "app/ledger/BookingPanel.tsx", "app/ledger/ReportsTab.tsx", "app/ledger/DetailTab.tsx",
    "app/ledger/FloorTab.tsx", "app/ledger/LoginsPanel.tsx", "app/ledger/billing/BillingSettings.tsx", "app/ledger/billing/LettersPanel.tsx", "app/ledger/billing/LetterRequestPanel.tsx"];
  for (const f of files) {
    const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");   // (the WhatsApp reminder wording is a later step)
    for (const w of [/AAKAR CO-OP/, /Aakar Co-op Housing/, /Mirambica/, /Naranpura/, /380013/, /G-16551/, /AHMEDABAD/, /Sukh Tower/, /Place: Ahmedabad/]) assert.doesNotMatch(src, w, `${f} ${w}`);
  }
});

test("the stamp is built on demand from the profile (not frozen when the file loads)", () => {
  const b = readFileSync("lib/billing.ts", "utf8");
  assert.match(b, /export const defaultStamp = \(\) =>/);
  assert.doesNotMatch(b, /DEFAULT_STAMP/);
});

const g: any = { areas: ["Plot A"], flat_id: "A101", book_date: "2026-12-01", slot: "day", total: 500 };
const c: any = { complaint_no: "C-1", area_name: "Lift", description: "Stuck", status: "closed", close_note: "Fixed" };

test("Aakar: message prefixes are exactly as before", () => {
  assert.equal(societyShort(), "Aakar Co-op Housing Society");
  assert.equal(societyAppName(), "Aakar");
  assert.equal(fileSlug(), "Aakar");
  assert.ok(noticeText(g, 4).startsWith("Aakar society notice: Plot A is booked"));
  assert.ok(noticeText(g, 1).startsWith("Aakar society notice: All common plot areas"));
  assert.ok(invoiceText(g, "B1").startsWith("Aakar society: your booking of Plot A"));
  assert.ok(waNewText(c, "A-101").startsWith("Aakar society complaint C-1 from Flat A-101"));
  assert.ok(waDoneText(c).startsWith("Aakar society: your complaint C-1 (Lift) is CLOSED."));
  assert.ok(waDoneText({ ...c, status: "in_progress" }).startsWith("Aakar society: your complaint C-1 (Lift) is IN PROGRESS."));
});

test("another society: messages, file names and the web address follow its profile", () => {
  try {
    applySocietyProfile(profileFromRow({ name: "GREEN VIEW", full_name: "GREEN VIEW CHS LTD.", building: "GREEN TOWER", address_lines: ["Ring Road"], public_url: "https://greenview.example" }));
    assert.equal(societyShort(), "Green View Chs");
    assert.equal(societyAppName(), "Green View");
    assert.equal(fileSlug(), "Green_View");
    assert.ok(noticeText(g, 4).startsWith("Green View society notice:"));
    assert.ok(waNewText(c, "A-101").startsWith("Green View society complaint"));
    assert.equal(siteUrl(), "https://greenview.example");
    applySocietyProfile(profileFromRow({ name: "GREEN VIEW", full_name: "GREEN VIEW CHS LTD.", public_url: "" }));
    assert.equal(siteUrl(), "");   // no window on the server: the message then has no web address line value
  } finally { applySocietyProfile(FALLBACK_PROFILE); }
});

test("the profile's web address is read from public_url and cached with the rest", () => {
  assert.equal(profileFromRow({ name: "A", full_name: "B", public_url: " https://x.example " }).publicUrl, "https://x.example");
  assert.equal(profileFromRow(null).publicUrl, "https://aakarsociety.vercel.app");
  assert.equal(SOCIETY.publicUrl, "https://aakarsociety.vercel.app");
});

test("no Aakar wording typed into messages, file names, the install button or the help prompt", () => {
  const files = ["lib/bookings.ts", "lib/complaints.ts", "lib/billing.ts", "app/api/help/route.ts", "app/api/backup/route.ts", "app/ledger/HelpChat.tsx", "app/ledger/LoginBanner.tsx",
    "app/ledger/CommitteePanel.tsx", "app/ledger/PwaRegister.tsx", "app/ledger/BackupPanel.tsx", "app/ledger/ReportsTab.tsx", "app/ledger/VehicleReport.tsx", "app/ledger/LoginsPanel.tsx",
    "app/ledger/billing/VerifyPayments.tsx", "app/ledger/billing/LedgerCard.tsx", "app/ledger/billing/LettersPanel.tsx", "app/ledger/billing/BillingTab.tsx"];
  for (const f of files) {
    const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    for (const w of [/Aakar/, /AAKAR/, /aakarsociety/, /Sukh Tower/]) {
      if (f === "app/ledger/BackupPanel.tsx" && w.source === "AAKAR") continue;
      assert.doesNotMatch(src.replace(/"aakar-society"/g, ""), w, `${f} ${w}`);
    }
  }
});
