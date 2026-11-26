// Reading the society profile and towers (19 Nov 2026): every value falls back to what the code has today. Sample data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOCIETY, TERRACE_TOWERS, buildCategories } from "../lib/society";
import { FALLBACK_PROFILE, applySocietyProfile, joinParts, profileFromRow, readCachedProfile, terraceCodes, towersFromRows, writeCachedProfile } from "../lib/societySetup";

const aakarRow = {
  id: 1, name: "AAKAR CO-OP", full_name: "AAKAR CO-OP HOUSING SOCIETY LTD.", reg_no: "G-16551", reg_date: "16-03-1994", building: "SUKH TOWER",
  address: "Sukh Tower, Mirambica Road, Naranpura, Ahmedabad", address_lines: ["Mirambica Road, Naranpura", "Ahmedabad - 380013"], city: "Ahmedabad", public_url: "https://aakarsociety.vercel.app",
};
const towerRows = [
  { code: "C", name: "Tower C", has_terrace: true, sort: 30, active: true },
  { code: "A", name: "Tower A", has_terrace: true, sort: 10, active: true },
  { code: "B", name: "Tower B", has_terrace: false, sort: 20, active: true },
];

test("the Aakar profile row gives exactly SOCIETY", () => {
  assert.deepEqual(profileFromRow(aakarRow), FALLBACK_PROFILE);
  assert.deepEqual(profileFromRow(aakarRow), { ...SOCIETY });
});

test("no row, or a row without its two names, keeps today's values", () => {
  assert.deepEqual(profileFromRow(null), FALLBACK_PROFILE);
  assert.deepEqual(profileFromRow({ name: "  ", full_name: null, address_lines: [] }), FALLBACK_PROFILE);
  assert.deepEqual(profileFromRow({ name: "X", full_name: "" }), FALLBACK_PROFILE);
});

test("a field the society left empty stays empty: it never shows another society's value", () => {
  const p = profileFromRow({ name: "GREEN VIEW", full_name: "GREEN VIEW CHS", reg_no: "", reg_date: null, building: " ", address: "", address_lines: [], city: "", public_url: null });
  assert.deepEqual(p, { name: "GREEN VIEW", full: "GREEN VIEW CHS", reg: "", regDate: "", building: "", address: "", addressLines: [], city: "", publicUrl: "" });
});

test("joinParts leaves out empty parts", () => {
  assert.equal(joinParts(["A", "", " B ", null, undefined, "C"]), "A • B • C");
  assert.equal(joinParts([]), "");
  assert.equal(joinParts(["x", "y"], ", "), "x, y");
});

test("a society's own values are used, trimmed", () => {
  const p = profileFromRow({ ...aakarRow, name: " GREEN VIEW ", building: "GREEN TOWER", address_lines: [" Line 1 ", "", "Line 2"], city: "Surat" });
  assert.equal(p.name, "GREEN VIEW");
  assert.equal(p.building, "GREEN TOWER");
  assert.deepEqual(p.addressLines, ["Line 1", "Line 2"]);
  assert.equal(p.city, "Surat");
  assert.equal(p.reg, "G-16551");
});

test("applySocietyProfile changes SOCIETY in place and does not share the address list", () => {
  const before = JSON.stringify(SOCIETY);
  try {
    const p = profileFromRow({ ...aakarRow, name: "TEST SOCIETY" });
    applySocietyProfile(p);
    assert.equal(SOCIETY.name, "TEST SOCIETY");
    p.addressLines.push("x");
    assert.equal(SOCIETY.addressLines.length, 2);
  } finally {
    applySocietyProfile(FALLBACK_PROFILE);
  }
  assert.equal(JSON.stringify(SOCIETY), before);
});

test("towers: the table's rows in their order; terrace from the table", () => {
  const t = towersFromRows(towerRows, []);
  assert.deepEqual(t.map((x) => x.code), ["A", "B", "C"]);
  assert.deepEqual(terraceCodes(t), TERRACE_TOWERS);
  assert.equal(t[1].name, "Tower B");
});

test("towers: inactive rows are left out, but a tower the flats use is never hidden", () => {
  const t = towersFromRows([...towerRows, { code: "D", name: "Tower D", has_terrace: false, sort: 40, active: false }], [{ tower: "D" }, { tower: "E" }, { tower: " A " }]);
  assert.deepEqual(t.map((x) => x.code), ["A", "B", "C", "D", "E"]);
  assert.equal(t.find((x) => x.code === "E")!.terrace, false);
});

test("towers: no rows (table missing or empty) falls back to the towers in the flats, then to A, B, C", () => {
  const flats = [{ tower: "B" }, { tower: "A" }, { tower: "C" }, { tower: null }];
  for (const rows of [null, undefined, [], [{ code: "" }]]) {
    const t = towersFromRows(rows as any, flats);
    assert.deepEqual(t.map((x) => x.code), ["A", "B", "C"]);
    assert.deepEqual(terraceCodes(t), TERRACE_TOWERS);
  }
  assert.deepEqual(towersFromRows(null, []).map((x) => x.code), ["A", "B", "C"]);
});

test("buildCategories: terrace towers come from the setup; the default is unchanged", () => {
  const flat = (id: string, tower: string, floor: number): any => ({ id, tower, floor, flat_no: id, maintenance: null, bhk: null, sqft: null });
  const flats = [flat("B101", "B", 1), flat("B201", "B", 2)];
  assert.deepEqual(buildCategories(flats).map((c) => c.key), ["B_STD"]);               // today: Tower B has no terrace
  assert.deepEqual(buildCategories(flats, ["B"]).map((c) => c.key), ["B_STD", "B_TERRACE"]);
});

test("cached profile: round trip, and a missing or broken store never throws", () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(readCachedProfile(store), null);
  const p = profileFromRow({ ...aakarRow, name: "GREEN VIEW" });
  writeCachedProfile(store, p);
  assert.deepEqual(readCachedProfile(store), p);
  mem.set("society_profile_v1", "{not json");
  assert.equal(readCachedProfile(store), null);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readCachedProfile(broken), null);
  assert.doesNotThrow(() => writeCachedProfile(broken, p));
  assert.equal(readCachedProfile(null), null);
});

test("the cached profile holds society details only, never resident data", () => {
  const src = readFileSync("lib/societySetup.ts", "utf8");
  assert.doesNotMatch(src, /^import .*supabaseClient/m);                       // pure file: tests (Node 20) can import it
  assert.doesNotMatch(src.slice(src.indexOf("const CACHE_KEY")), /owner|email|mobile|flats/i);
});

test("screens take the society name and towers from the setup, not from typed-in text", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /from\("society_profile"\)/);
  assert.doesNotMatch(page, /EST 1994/);
  assert.match(page, /from\("towers"\)/);
  assert.doesNotMatch(page, /AAKAR CO-OP|Sukh Tower|Mirambica|AHMEDABAD/);
  for (const f of ["app/ledger/billing/BillingTab.tsx", "app/ledger/NoticesTab.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /<option[^>]*>(Tower )?[ABC]<\/option>/, f);
  }
  for (const f of ["app/ledger/ComplaintsPanel.tsx", "app/ledger/billing/LettersRegister.tsx", "app/ledger/billing/BillingTab.tsx", "app/ledger/ReportsTab.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /<h1>(ॐ )?AAKAR CO-OP/, f);
  }
});

test("screens do not print Aakar's storage bucket or founding year", () => {
  for (const f of ["app/ledger/Sidebar.tsx", "app/ledger/VaultTab.tsx", "app/ledger/FloorTab.tsx", "app/ledger/NoticesTab.tsx", "app/ledger/CoverTab.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /aakar-vault|EST 1994/, f);
  }
});
