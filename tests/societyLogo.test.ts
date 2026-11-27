import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FIRST_SOCIETY_MARK, LOGO_MAX_CHARS, initialOf, markOf, safeLogo, sealHtml, titleMarkHtml } from "../lib/societyLogo";
import { profileFromRow, readCachedProfile, writeCachedProfile } from "../lib/societySetup";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("only a small PNG / JPEG / WEBP data URL counts as a logo", () => {
  assert.equal(safeLogo(PNG), PNG);
  assert.equal(safeLogo("data:image/webp;base64,AAAA"), "data:image/webp;base64,AAAA");
  assert.equal(safeLogo("data:image/svg+xml;base64,AAAA"), "");           // svg can carry scripts
  assert.equal(safeLogo("javascript:alert(1)"), "");
  assert.equal(safeLogo('data:image/png;base64,AAAA"><script>'), "");
  assert.equal(safeLogo("https://example.com/logo.png"), "");
  assert.equal(safeLogo("data:image/png;base64," + "A".repeat(LOGO_MAX_CHARS)), "");
  assert.equal(safeLogo(null), ""); assert.equal(safeLogo(42), "");
});

test("no logo: the first society keeps Om, others show the first letter of their name", () => {
  assert.deepEqual(markOf({ logo: "", name: "AAKAR CO-OP", first: true }), { kind: "text", text: FIRST_SOCIETY_MARK });
  assert.deepEqual(markOf({ logo: "", name: "Test Park", first: false }), { kind: "text", text: "T" });
  assert.deepEqual(markOf({ logo: PNG, name: "Test Park", first: false }), { kind: "image", src: PNG });
  assert.deepEqual(markOf({ logo: "data:image/svg+xml;base64,AAAA", name: "Zed", first: false }), { kind: "text", text: "Z" });
  assert.equal(initialOf("  123 Heights"), "1");
  assert.equal(initialOf("ગ્રીન"), "ગ");
  assert.equal(initialOf(""), "S"); assert.equal(initialOf("---"), "S");
});

test("printed pages: seal and heading mark", () => {
  assert.equal(sealHtml({ kind: "text", text: "T" }), "T");
  assert.equal(sealHtml({ kind: "text", text: "<b>" }), "&lt;b&gt;");
  assert.match(sealHtml({ kind: "image", src: PNG }), /^<img class="logo" src="data:image\/png;base64,/);
  assert.equal(titleMarkHtml({ kind: "text", text: "T" }, false), "");                 // a society without a logo has no mark in headings
  assert.equal(titleMarkHtml({ kind: "text", text: FIRST_SOCIETY_MARK }, true), FIRST_SOCIETY_MARK + " ");
  assert.match(titleMarkHtml({ kind: "image", src: PNG }, false), /^<img src="data:image\/png/);
});

test("the profile row and the login-page cache carry the logo, and drop an unsafe one", () => {
  const row = { name: "Test Park", full_name: "TEST PARK HOUSING SOCIETY", logo_image: PNG };
  assert.equal(profileFromRow(row).logo, PNG);
  assert.equal(profileFromRow({ ...row, logo_image: "javascript:x" }).logo, "");
  assert.equal(profileFromRow({ ...row, logo_image: null }).logo, "");
  const mem: Record<string, string> = {}; const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  writeCachedProfile(store, profileFromRow(row), "test-park");
  assert.equal(readCachedProfile(store, "test-park")?.logo, PNG);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (n === "node_modules" || n === ".next") continue; if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p); }
  return out;
}
test("the Om sign is typed in one place only (lib/societyLogo.ts)", () => {
  const bad = [...walk(join(root, "app")), ...walk(join(root, "lib"))].filter((f) => !f.endsWith(join("lib", "societyLogo.ts")) && readFileSync(f, "utf8").includes("ॐ"));
  assert.deepEqual(bad, []);
});

test("printed seals and the editor use the logo helpers", () => {
  assert.match(read("lib/billing.ts"), /<div class="seal">\$\{sealHtml\(\)\}<\/div>/);
  assert.match(read("lib/flatCard.ts"), /<div class="seal">\$\{sealHtml\(\)\}<\/div>/);
  assert.match(read("app/ledger/SetupEditors.tsx"), /logo_image: dataUrl/);
});

test("MT_19 scripts: column + limit + logo only when present; undo restores the old answer", () => {
  const s = read("multitenant/MT_19_SOCIETY_LOGO.sql"), u = read("multitenant/MT_19_UNDO.sql"), t = read("multitenant/MT_19_TEST.sql");
  assert.match(s, /add column if not exists logo_image/);
  assert.match(s, /length\(logo_image\) <= 120000/);
  assert.match(s, /jsonb_strip_nulls\(jsonb_build_object\('slug', s\.slug, 'name', s\.name, 'logo', nullif\(p\.logo_image, ''\)\)\)/);
  assert.match(s, /s\.status = 'active'/);
  assert.match(u, /jsonb_build_object\('slug', s\.slug, 'name', s\.name\)/);
  assert.match(u, /drop column if exists logo_image/);
  assert.match(t, /raise exception E'RESULT/);
});

test("the LOGO sentence names the Om sign for the first society and the first letter for the others", async () => {
  const { noLogoText } = await import("../lib/societyLogo");
  assert.match(noLogoText(true), /Om sign/); assert.doesNotMatch(noLogoText(true), /first letter/);
  assert.match(noLogoText(false), /first letter/); assert.doesNotMatch(noLogoText(false), /Om sign/);
});
