// Important contacts (30 Oct 2026): tap-to-call links, grouping, search, form checks. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contactError, groupContacts, matchContact, telHref, type Contact } from "../lib/contacts";
import { residentTabs, cleanSetting } from "../lib/memberTabs";

const c = (x: Partial<Contact>): Contact => ({ id: x.name || "x", category: "Other", name: "N", contact_person: null, phone: null, alt_phone: null, notes: null, sort_order: 100, active: true, amc_id: null, ...x });

test("phone numbers become tap-to-call links", () => {
  assert.equal(telHref("+91 98765 43210"), "tel:+919876543210");
  assert.equal(telHref("079-2345 6789"), "tel:07923456789");
  assert.equal(telHref("101"), "tel:101");
  assert.equal(telHref(""), "");
  assert.equal(telHref("call office"), "");
});

test("grouped by category, in order", () => {
  const g = groupContacts([c({ name: "Plumber Two", category: "Plumber", sort_order: 20 }), c({ name: "Fire", category: "Fire", sort_order: 1 }), c({ name: "Plumber One", category: "Plumber", sort_order: 10 })]);
  assert.deepEqual(g.map(([k, v]) => [k, v.map((x) => x.name)]), [["Fire", ["Fire"]], ["Plumber", ["Plumber One", "Plumber Two"]]]);
});

test("search by name, category or digits", () => {
  const x = c({ name: "Lift company", category: "Lift", phone: "98765 43210", notes: "24 hours" });
  assert.ok(matchContact(x, "lift"));
  assert.ok(matchContact(x, "65 432"));
  assert.ok(matchContact(x, "24 hours"));
  assert.ok(!matchContact(x, "plumber"));
});

test("form needs category, name and a phone", () => {
  assert.match(contactError({ category: "", name: "A", phone: "123", alt_phone: "" }), /CATEGORY/);
  assert.match(contactError({ category: "Lift", name: " ", phone: "123", alt_phone: "" }), /NAME/);
  assert.match(contactError({ category: "Lift", name: "A", phone: "", alt_phone: "" }), /PHONE/);
  assert.match(contactError({ category: "Lift", name: "A", phone: "abc", alt_phone: "" }), /phone number/);
  assert.equal(contactError({ category: "Lift", name: "A", phone: "", alt_phone: "98765 43210" }), "");
});

test("CONTACTS is a member screen the committee can show or hide", () => {
  assert.ok(residentTabs(null).includes("CONTACTS"));
  assert.ok(residentTabs(["COVER", "CONTACTS"]).includes("CONTACTS"));
  assert.ok(!residentTabs(["COVER"]).includes("CONTACTS"));
  assert.deepEqual(cleanSetting(["CONTACTS", "COVER"]), ["COVER", "CONTACTS"]);
});
