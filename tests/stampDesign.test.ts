import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_STAMP_DESIGN, STAMP_COLORS, normalizeDesign, stampDataUrl, stampSvg, type StampSociety } from "../lib/stampDesign";
import { BG_MAX_CHARS, backgroundSrc, safeBackground } from "../lib/printBackground";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/> </g, "><");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const aakar: StampSociety = { full: "AAKAR CO-OP HOUSING SOCIETY LTD.", name: "AAKAR CO-OP", city: "Ahmedabad", reg: "G-16551", building: "SUKH TOWER", year: "1994" };
const green: StampSociety = { full: "GREEN VIEW CHS", name: "GREEN VIEW", city: "", reg: "", building: "", year: "" };

test("the default design draws exactly the stamp the app always had", () => {
  assert.equal(norm(stampSvg(DEFAULT_STAMP_DESIGN, aakar)), norm(read("tests/fixtures/default-stamp.svg")));
  assert.equal(norm(stampSvg(normalizeDesign(null), aakar)), norm(read("tests/fixtures/default-stamp.svg")));
});

test("junk in the database becomes a complete valid design", () => {
  assert.deepEqual(normalizeDesign(undefined), DEFAULT_STAMP_DESIGN);
  assert.deepEqual(normalizeDesign([1, 2]), DEFAULT_STAMP_DESIGN);
  assert.deepEqual(normalizeDesign({ color: "pink", centre: "x", ring: 5, city: "yes", year: null }), DEFAULT_STAMP_DESIGN);
  assert.deepEqual(normalizeDesign({ color: "red", centre: "building", ring: "short", city: false, year: false }), { color: "red", centre: "building", ring: "short", city: false, year: false });
});

test("empty parts are left out, never a dangling label", () => {
  const svg = stampSvg(DEFAULT_STAMP_DESIGN, green);
  assert.doesNotMatch(svg, /REG\. NO\./); assert.doesNotMatch(svg, /EST\./); assert.doesNotMatch(svg, /★/);
  assert.match(svg, /GREEN VIEW CHS/);
  const onlyYear = stampSvg(DEFAULT_STAMP_DESIGN, { ...green, year: "2010" });
  assert.match(onlyYear, /EST\. 2010/); assert.doesNotMatch(onlyYear, /REG\. NO\./);
  const noCity = stampSvg({ ...DEFAULT_STAMP_DESIGN, city: false }, aakar); assert.doesNotMatch(noCity, /AHMEDABAD/);
  const noYear = stampSvg({ ...DEFAULT_STAMP_DESIGN, year: false }, aakar); assert.doesNotMatch(noYear, /EST\./);
});

test("middle of the stamp: building name, logo, and the fallbacks", () => {
  const b = stampSvg({ ...DEFAULT_STAMP_DESIGN, centre: "building" }, aakar);
  assert.match(b, /SUKH TOWER/); assert.doesNotMatch(b, /REG\. NO\./);
  const noReg = stampSvg(DEFAULT_STAMP_DESIGN, { ...aakar, reg: "" });
  assert.match(noReg, /SUKH TOWER/);                                  // registration number empty: the building name stands in the middle
  const logo = stampSvg({ ...DEFAULT_STAMP_DESIGN, centre: "logo" }, { ...aakar, logo: PNG });
  assert.match(logo, /<image href="data:image\/png/); assert.doesNotMatch(logo, /REG\. NO\./);
  const noLogo = stampSvg({ ...DEFAULT_STAMP_DESIGN, centre: "logo" }, aakar);
  assert.match(noLogo, /G-16551/); assert.doesNotMatch(noLogo, /<image/);   // logo chosen but none saved: back to the registration number
  const bad = stampSvg({ ...DEFAULT_STAMP_DESIGN, centre: "logo" }, { ...aakar, logo: "javascript:alert(1)" });
  assert.doesNotMatch(bad, /<image/);
});

test("colour, ring text and escaping", () => {
  assert.match(stampSvg({ ...DEFAULT_STAMP_DESIGN, color: "red" }, aakar), new RegExp(STAMP_COLORS.red));
  assert.doesNotMatch(stampSvg({ ...DEFAULT_STAMP_DESIGN, color: "red" }, aakar), new RegExp(STAMP_COLORS.blue));
  assert.match(stampSvg({ ...DEFAULT_STAMP_DESIGN, ring: "short" }, aakar), /AAKAR CO-OP</);
  const esc = stampSvg(DEFAULT_STAMP_DESIGN, { ...aakar, full: "A & B <SOCIETY>", city: "X<Y" });
  assert.doesNotMatch(esc, /<SOCIETY>/); assert.match(esc, /A &amp; B &lt;SOC\.&gt;/);
  const long = stampSvg(DEFAULT_STAMP_DESIGN, { ...aakar, full: "THE VERY LONG NAMED HOUSING COOPERATIVE SOCIETY OF THE RESIDENTS LTD." });
  assert.match(long, /font-size="(2[6-9]|3\d|4[0-3])" letter-spacing="4"/);   // a long name gets a smaller ring text
  assert.match(stampDataUrl(DEFAULT_STAMP_DESIGN, aakar), /^data:image\/svg\+xml;charset=utf-8,/);
});

test("paper background: only a small image data URL; own picture, else the first society's building, else none", () => {
  assert.equal(safeBackground(PNG), PNG);
  assert.equal(safeBackground("data:image/svg+xml;base64,AAAA"), "");
  assert.equal(safeBackground('data:image/jpeg;base64,AAAA"><script>'), "");
  assert.equal(safeBackground("data:image/jpeg;base64," + "A".repeat(BG_MAX_CHARS)), "");
  assert.equal(safeBackground(null), "");
  assert.equal(backgroundSrc(PNG, false), PNG);
  assert.equal(backgroundSrc(PNG, true), PNG);
  assert.equal(backgroundSrc("", true), "/print/building-bg.jpg");
  assert.equal(backgroundSrc("", false), "");
});

test("printing uses the designed stamp and the chosen background", () => {
  const b = read("lib/billing.ts");
  assert.match(b, /const stamp = stampOf\(s\);/);
  assert.match(b, /stampOf\(c\.settings\)/);
  assert.doesNotMatch(b, /stamp_image \|\| defaultStamp\(\)/);
  assert.match(b, /setPrintBackground\(\(data as Settings \| null\)\?\.print_background\)/);
  assert.match(b, /backgroundSrc\(customBackground,/);
  assert.doesNotMatch(b, /src="\/print\/building-bg\.jpg"/);          // the building picture is named only in lib/printBackground.ts
});

test("MT_20 scripts: two columns, limits, undo removes them", () => {
  const s = read("multitenant/MT_20_STAMP_BACKGROUND.sql"), u = read("multitenant/MT_20_UNDO.sql"), t = read("multitenant/MT_20_TEST.sql");
  assert.match(s, /add column if not exists stamp_design jsonb/); assert.match(s, /add column if not exists print_background text/);
  assert.match(s, /length\(print_background\) <= 250000/); assert.match(s, /jsonb_typeof\(stamp_design\) = 'object'/);
  assert.match(u, /drop column if exists stamp_design/); assert.match(u, /drop column if exists print_background/);
  assert.match(t, /raise exception E'RESULT/);
});
