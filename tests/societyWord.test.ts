// Society word (multi-tenant login): the helpers behind /<word> addresses and the internal flat-login address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWord, FIRST_SOCIETY_WORD, residentDomain, usesLegacyAddress, wordFromDomain, wordFromPath } from "../lib/societyWord";
import { flatEmail, isFlatEmail, tenantEmail, RESIDENT_DOMAIN } from "../lib/residents";
import { enteredByLabel } from "../lib/enteredBy";

test("a society word is cleaned like the database slug, and the app's own pages are never a word", () => {
  assert.equal(cleanWord("  Sample-Gardens/ "), "sample-gardens");
  for (const bad of ["", "a", "-ab", "ab-", "a b", "sample_gardens", "api", "ledger", "platform", "x".repeat(41)]) assert.equal(cleanWord(bad), null, bad);
  assert.equal(wordFromPath("/sample-gardens"), "sample-gardens");
  assert.equal(wordFromPath("/sample-gardens/x/y"), "sample-gardens");
  assert.equal(wordFromPath("/"), null);
  assert.equal(wordFromPath("/api/help"), null);
});

test("the first society and 'no word' keep the old flat-login address; other societies get the word inside it", () => {
  assert.equal(flatEmail("A101"), `a101@${RESIDENT_DOMAIN}`);
  assert.equal(flatEmail("A101", null), `a101@${RESIDENT_DOMAIN}`);
  assert.equal(flatEmail("A101", FIRST_SOCIETY_WORD), `a101@${RESIDENT_DOMAIN}`);
  assert.equal(flatEmail("A101", "sample-gardens"), `a101@sample-gardens.${RESIDENT_DOMAIN}`);
  assert.equal(tenantEmail("A102", "sample-gardens"), `a102.tenant@sample-gardens.${RESIDENT_DOMAIN}`);
  assert.notEqual(flatEmail("A101", "sample-gardens"), flatEmail("A101"), "the same flat number in two societies never gives the same login");
  assert.ok(usesLegacyAddress(undefined) && usesLegacyAddress("aakar") && !usesLegacyAddress("sample-gardens"));
  assert.equal(residentDomain("flats.x.app", "abc"), "abc.flats.x.app");
});

test("flat-login addresses of every society are recognised, other emails are not", () => {
  for (const e of [flatEmail("A101"), flatEmail("A101", "sample-gardens"), tenantEmail("B203", "sample-gardens")]) assert.ok(isFlatEmail(e), e);
  for (const e of ["a@gmail.com", "x@evil.flats.aakarsociety.app.attacker.com", "x@.flats.aakarsociety.app", "x@api.flats.aakarsociety.app", "", null]) assert.ok(!isFlatEmail(e as any), String(e));
  assert.equal(wordFromDomain(`sample-gardens.${RESIDENT_DOMAIN}`, RESIDENT_DOMAIN), "sample-gardens");
  assert.equal(wordFromDomain(RESIDENT_DOMAIN, RESIDENT_DOMAIN), null);
});

test("'entered by' names flat logins of any society and still hides committee emails from members", () => {
  assert.equal(enteredByLabel(flatEmail("A101", "sample-gardens"), false), "Flat login A-101");
  assert.equal(enteredByLabel(tenantEmail("A102", "sample-gardens"), false), "Tenant login A-102");
  assert.equal(enteredByLabel("chair@example.com", false), "Committee");
});
