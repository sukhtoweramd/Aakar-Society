// Letter formats (30 Oct 2026): fields are filled from the flat's records; missing values stay visible. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate, letterData } from "../lib/letterTemplates";

const flat = { id: "A101", tower: "A", floor: 1, owner_name: "SAMPLE OWNER", share_cert_no: "123", member_since: "2001-04-01" };
const data = (x: any = {}) => letterData(flat, { society: "SAMPLE SOCIETY", building: "SAMPLE TOWER", date: "2026-10-30", ...x });

test("fields are filled from the flat's records", () => {
  const t = fillTemplate("{{owner_name}} of Flat {{flat_no}}, Tower {{tower}}, {{building}}, certificate {{share_cert_no}}, member since {{member_since}}, on {{date}}.", data());
  assert.equal(t, "SAMPLE OWNER of Flat A-101, Tower A, SAMPLE TOWER, certificate 123, member since 01 April 2001, on 30 October 2026.");
});

test("dues: nil, an amount, or blank for the committee to fill", () => {
  assert.equal(fillTemplate("Dues {{dues}}", data({ dues: 0 })), "Dues ₹0 (nil)");
  assert.equal(fillTemplate("Dues {{dues}}", data({ dues: 15700 })), "Dues ₹15,700");
  assert.equal(fillTemplate("Dues {{dues}}", data({ dues: null })), "Dues ______");
});

test("an empty purpose leaves no gap; unknown fields are left as typed", () => {
  assert.equal(fillTemplate("Line one.\n\n{{purpose}}", data()), "Line one.");
  assert.equal(fillTemplate("Hello {{nickname}}", data()), "Hello {{nickname}}");
  assert.equal(fillTemplate("Cert {{share_cert_no}}", letterData({ id: "A102" }, { society: "S", building: "B" })), "Cert ______");
});
