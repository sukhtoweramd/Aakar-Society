// Society wording on printed papers and screens (19 Nov 2026): taken from the society profile, Aakar's output unchanged. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOCIETY, addressOneLine, addressWithPin, nameLines, nameSuffix, regYear, societyPin, societyTitle, titleCase } from "../lib/society";
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
    const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l) && !/Gentle reminder|Aakar Co-op Housing Society:/.test(l)).join("\n");   // (the WhatsApp reminder wording is a later step)
    for (const w of [/AAKAR CO-OP/, /Aakar Co-op Housing/, /Mirambica/, /Naranpura/, /380013/, /G-16551/, /AHMEDABAD/, /Sukh Tower/, /Place: Ahmedabad/]) assert.doesNotMatch(src, w, `${f} ${w}`);
  }
});

test("the stamp is built on demand from the profile (not frozen when the file loads)", () => {
  const b = readFileSync("lib/billing.ts", "utf8");
  assert.match(b, /export const defaultStamp = \(\) =>/);
  assert.doesNotMatch(b, /DEFAULT_STAMP/);
});
