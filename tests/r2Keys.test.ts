// R2 files: stored links (old public addresses or keys) must map to the right key, and the folder rules must
// keep flat documents, AMC and committee papers away from other logins. Sample addresses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { folderAccess, folderOfKey, parseFileRef, rowFolder, storedForms } from "../lib/r2Keys";

const BASE = "https://pub-sample.r2.dev";
const committee = { isCommittee: true, flatId: null };
const a503 = { isCommittee: false, flatId: "A503" };

test("old public addresses and bare keys give the same key", () => {
  const want = { kind: "r2", key: "notices/1729000000000_Water_cut.jpg", folder: "notices" };
  assert.deepEqual(parseFileRef(`${BASE}/notices/1729000000000_Water_cut.jpg`, [BASE]), want);
  assert.deepEqual(parseFileRef(`${BASE}/notices/1729000000000_Water_cut.jpg`, []), want);           // any *.r2.dev address
  assert.deepEqual(parseFileRef("notices/1729000000000_Water_cut.jpg", [BASE]), want);
  assert.deepEqual(parseFileRef("https://files.sample.org/flats/A503/1_deed.pdf", ["https://files.sample.org/"]),
    { kind: "r2", key: "flats/A503/1_deed.pdf", folder: "flats/A503" });
  assert.equal(parseFileRef(`${BASE}/flats/A503/a%20b.pdf`, [BASE])?.kind, "r2");
});

test("other websites stay as they are; odd links are refused", () => {
  assert.deepEqual(parseFileRef("https://drive.google.com/file/d/x", [BASE]), { kind: "external", url: "https://drive.google.com/file/d/x" });
  for (const bad of ["", "data:image/png;base64,AA", "/api/backup", "javascript:alert(1)", "payproofs/A503/x.jpg", "backups/x.json",
    "flats/A503/../A504/x.pdf", "flats/a503/x.pdf", "notices/", `${BASE}/backups/x.json`, `${BASE}/flats/A503/..`])
    assert.equal(parseFileRef(bad, [BASE]), null, bad);
});

test("folder of a key", () => {
  assert.equal(folderOfKey("vault/society-registration.pdf"), "vault");
  assert.equal(folderOfKey("events/0a1b2c3d-0000-4000-8000-000000000000/p.jpg"), "events/0a1b2c3d-0000-4000-8000-000000000000");
  assert.equal(folderOfKey("events/x/p.jpg"), null);
  assert.equal(folderOfKey("vault/sub/x.pdf"), null);
});

test("who may open which folder", () => {
  for (const f of ["notices", "vault", "amc", "minutes", "flats/B101", "eventdocs/0a1b2c3d-0000-4000-8000-000000000000"])
    assert.equal(folderAccess(f, committee), "yes", f);
  assert.equal(folderAccess("flats/A503", a503), "yes");
  assert.equal(folderAccess("flats/B101", a503), "no");
  assert.equal(folderAccess("amc", a503), "no");
  assert.equal(folderAccess("minutes", a503), "record");
  assert.equal(folderAccess("eventdocs/0a1b2c3d-0000-4000-8000-000000000000", a503), "team");
  for (const f of ["notices", "vault", "floor-plans/A", "events/0a1b2c3d-0000-4000-8000-000000000000"]) assert.equal(folderAccess(f, a503), "yes", f);
  assert.equal(folderAccess("flats/A503", { isCommittee: false, flatId: null }), "no");
  assert.equal(folderAccess("complaints/A503", a503), "yes");
  assert.equal(folderAccess("complaints/B101", a503), "record");
  assert.equal(folderAccess("complaints/B101", committee), "yes");
});

test("stored forms cover key and public address", () => {
  assert.deepEqual(storedForms("minutes/1_x.pdf", [BASE + "/"]), ["minutes/1_x.pdf", `${BASE}/minutes/1_x.pdf`]);
});

// Audit L1: a row vouches for a file only inside its own folder.
test("rowFolder ties a row's file link to its own folder", () => {
  const ev = "11111111-2222-3333-4444-555555555555";
  assert.equal(rowFolder("meetings", { event_id: null }), "minutes");
  assert.equal(rowFolder("meetings", { event_id: ev }), `eventdocs/${ev}`);
  assert.equal(rowFolder("event_money", { event_id: ev }), `eventdocs/${ev}`);
  assert.equal(rowFolder("event_money", {}), null);
  assert.equal(rowFolder("complaints", { flat_id: "A503" }), "complaints/A503");
  assert.equal(rowFolder("complaints", { flat_id: null }), null);
  // a complaint of A503 holding B201's photo key does not open it
  assert.notEqual(rowFolder("complaints", { flat_id: "A503" }), folderOfKey("complaints/B201/1729_x.jpg"));
  // committee minutes are not opened through an event entry
  assert.notEqual(rowFolder("event_money", { event_id: ev }), folderOfKey("minutes/1729_agm.pdf"));
});
