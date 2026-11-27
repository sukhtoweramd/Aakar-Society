import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ICON_SIZES, fallbackSociety, iconLetter, iconPlan, isIconSize, ownFilesWord, shortNameOf, societyManifest } from "../lib/societyPwa";

const read = (f: string) => readFileSync(f, "utf8");

test("home-screen label: the society name, short enough", () => {
  assert.equal(shortNameOf("Test Park"), "Test Park");
  assert.equal(shortNameOf("Green View Residency Apartments"), "Green View");
  assert.equal(shortNameOf("Supercalifragilistic"), "Supercalifra");
  assert.equal(shortNameOf("   "), "Society"); assert.equal(shortNameOf(null), "Society");
});

test("icon letter: Latin or digit only (the icon font has no Indian scripts)", () => {
  assert.equal(iconLetter("test park"), "T"); assert.equal(iconLetter("9 Elms"), "9");
  assert.equal(iconLetter("આકાર Aakar"), "A"); assert.equal(iconLetter("आकार"), "S"); assert.equal(iconLetter(""), "S");
});

test("manifest: own name, address, scope and icons; start page inside the scope", () => {
  const m = societyManifest({ slug: "test-park", name: "Test Park" });
  assert.equal(m.name, "Test Park"); assert.equal(m.short_name, "Test Park");
  assert.equal(m.start_url, "/test-park"); assert.equal(m.scope, "/test-park"); assert.equal(m.id, "/test-park");
  assert.ok(m.start_url.startsWith(m.scope));
  assert.deepEqual(m.icons.map((i) => i.purpose), ["any", "any", "maskable"]);
  for (const i of m.icons) assert.match(i.src, /^\/api\/society-icon\/test-park\/(192|512|maskable-512)$/);
  assert.doesNotMatch(JSON.stringify(m), /aakar/i);
});

test("the first society and reserved words keep the static files", () => {
  assert.equal(ownFilesWord("aakar"), null); assert.equal(ownFilesWord("api"), null); assert.equal(ownFilesWord("platform"), null);
  assert.equal(ownFilesWord("Test-Park"), "test-park"); assert.equal(ownFilesWord("x"), null);
  assert.ok(isIconSize("180") && isIconSize("maskable-512") && !isIconSize("64"));
  assert.equal(ICON_SIZES.length, 4);
});

test("a maskable icon keeps a safe margin", () => {
  assert.ok(iconPlan("maskable-512").inner < iconPlan("512").inner);
  assert.equal(iconPlan("512").px, 512); assert.equal(iconPlan("180").px, 180);
});

test("routes read public facts only: publishable key, no server key, no society data", () => {
  for (const f of ["app/api/society-manifest/[word]/route.ts", "app/api/society-icon/[word]/[size]/route.tsx", "lib/societyPublicServer.ts", "lib/iconLogo.ts", "app/[society]/layout.tsx"]) {
    assert.doesNotMatch(read(f), /getAdminClient|SECRET_KEY|SERVICE_ROLE|auth\.admin/, f);
  }
  assert.match(read("lib/societyPublicServer.ts"), /rpc\("society_public"/);
  assert.match(read("lib/societyPublicServer.ts"), /first\.failed \? once\(word\)/);   // one retry
  assert.doesNotMatch(read("lib/societyPublicServer.ts"), /\.from\(/);
  assert.match(read("app/api/society-icon/[word]/[size]/route.tsx"), /iconReadyLogo\(safeLogo\(/);   // a logo is checked, and WEBP is converted, before it is drawn
});

test("the first society's static manifest and layout are unchanged", () => {
  const m = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(m.name, "Aakar Co-op • Sukh Tower"); assert.equal(m.start_url, "/");
  assert.match(read("app/layout.tsx"), /manifest: "\/manifest\.webmanifest"/);
  assert.match(read("app/[society]/layout.tsx"), /if \(!society && !failed\) return \{\};/);   // only "no such society" keeps the default head
});

test("offline page: society name from the saved profile, Aakar only as the first society's fallback", () => {
  const h = read("public/offline.html");
  assert.match(h, /society_profile_v1/); assert.doesNotMatch(h, /<title>[^<]*Aakar/); assert.doesNotMatch(h, /<p>Aakar/);
});

test("a failed lookup never becomes the first society's identity", () => {
  assert.deepEqual(fallbackSociety("sample-gardens"), { slug: "sample-gardens", name: "Sample Gardens", logo: null });
  assert.equal(fallbackSociety("test-park").name, "Test Park");
  assert.doesNotMatch(JSON.stringify(societyManifest(fallbackSociety("sample-gardens"))), /aakar/i);
  for (const f of ["app/api/society-manifest/[word]/route.ts", "app/api/society-icon/[word]/[size]/route.tsx", "app/[society]/layout.tsx"]) {
    const c = read(f);
    assert.match(c, /lookupSociety\(/, f); assert.match(c, /fallbackSociety\(/, f);
    assert.match(c, /!society && !failed/, f);        // only a lookup that WORKED and found nothing falls back to the static files
  }
  assert.match(read("app/api/society-manifest/[word]/route.ts"), /"no-store"/);
  assert.match(read("app/api/society-icon/[word]/[size]/route.tsx"), /"no-store"/);
});
