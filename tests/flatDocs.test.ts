// Flat documents checklist and member screens setting. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { docChecklist, docTypeOf } from "../lib/flatDocTypes";
import { residentTabs, cleanSetting } from "../lib/memberTabs";

test("stored document types map to the list", () => {
  assert.equal(docTypeOf("Sale deed")?.name, "Dastavej");
  assert.equal(docTypeOf("index copy")?.name, "Index");
  assert.equal(docTypeOf("Torrent Power bill")?.key, "torrent");
  assert.equal(docTypeOf("Share Certificate")?.key, "share");
  assert.equal(docTypeOf("Police verification"), null);
  assert.equal(docTypeOf(""), null);
});

test("rent agreement is needed only for rented flats", () => {
  assert.equal(docChecklist([], false).some((d) => d.key === "rent"), false);
  assert.equal(docChecklist([], true).some((d) => d.key === "rent"), true);
  const c = docChecklist(["Index", "Sale deed", null], false);
  assert.deepEqual(c.filter((d) => d.uploaded).map((d) => d.key), ["index", "dastavej"]);
  assert.equal(c.length, 7);
});

test("member tabs: MY FLAT and NOTICES always; nothing saved = all", () => {
  assert.deepEqual(residentTabs([]), ["DETAIL", "NOTICES"]);
  assert.ok(residentTabs(null).includes("VAULT"));
  assert.deepEqual(residentTabs(["VAULT", "ADMIN", "BILLING"]).sort(), ["DETAIL", "NOTICES", "VAULT"].sort());
  assert.deepEqual(cleanSetting(["EVENTS", "ADMIN", "COVER"]), ["COVER", "EVENTS"]);
});
