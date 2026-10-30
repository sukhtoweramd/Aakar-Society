// SAVE / SHARE PDF in print windows (30 Oct 2026): A4 slicing, every print bar has the button,
// and the Directory is a people-only report.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const code = readFileSync("public/print/pdf.js", "utf8");
const sandbox: any = { window: {} };
runInNewContext(code, sandbox);
// the function runs in another context: copy its result into plain arrays here
const slice = (total: number, pageH: number, cuts: number[], opts?: any): [number, number, number][] =>
  JSON.parse(JSON.stringify(sandbox.window.__aakarSlicePages(total, pageH, cuts, opts)));

const MM = 96 / 25.4;
const portraitH = (297 - 20 - 8) * MM;
const landscapeH = (210 - 20 - 8) * MM;

test("short report fits on one page", () => {
  assert.deepEqual(slice(500, portraitH, []), [[0, 500, 0]]);
});

test("pages cover the whole report without gaps or overlaps (portrait and landscape)", () => {
  for (const pageH of [portraitH, landscapeH]) {
    const total = 5000;
    const rows = Array.from({ length: 200 }, (_, i) => i * 25);
    const pages = slice(total, pageH, rows);
    assert.equal(pages[0][0], 0);
    assert.equal(pages[pages.length - 1][1], total);
    for (let i = 1; i < pages.length; i++) assert.equal(pages[i][0], pages[i - 1][1]);
    for (const [a, b] of pages) assert.ok(b - a <= pageH + 0.001);
    assert.equal(pages.length, Math.ceil(total / (Math.floor(pageH / 25) * 25)));
  }
});

test("cuts at a row edge, never inside a row", () => {
  const rows = [0, 300, 600, 900, 1100];
  const pages = slice(1500, 1000, rows);
  assert.deepEqual(pages[0], [0, 900, 0]);
});

test("no row edge in the lower half of the page: cut at the page height", () => {
  assert.deepEqual(slice(2500, 1000, [100])[0], [0, 1000, 0]);
});

test("a page break (e.g. each tower) starts a new page", () => {
  const pages = slice(3000, 1000, [100, 200, 300, 700, 900], { forced: [400] });
  assert.deepEqual(pages[0], [0, 400, 0]);
  assert.equal(pages[1][0], 400);
});

test("pages after the first leave room for the repeated column headings", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i * 25);
  const pages = slice(3000, 1000, rows, { headerAt: (y: number) => (y > 0 ? 30 : 0) });
  assert.equal(pages[0][2], 0);
  for (const [a, b, h] of pages.slice(1)) { assert.equal(h, 30); assert.ok(b - a + h <= 1000); }
  assert.equal(pages[pages.length - 1][1], 3000);
});

test("every print bar offers SAVE / SHARE PDF", () => {
  const printBack = readFileSync("lib/printBack.ts", "utf8");
  assert.match(printBack, /export function backBar[\s\S]*pdfButton\(/);
  for (const f of ["lib/flatCard.ts", "lib/billing.ts", "app/ledger/VehicleReport.tsx", "app/ledger/DirectoryTab.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.ok(!s.includes("PRINT / SAVE AS PDF"), f + " still has the old print-only button");
    assert.match(s, /\$\{pdfButton\(\)\}/, f);
  }
});

test("print backgrounds have no see-through gradient (iPhone printed it as black)", () => {
  for (const f of ["lib/flatCard.ts", "lib/billing.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /gradient\([^)]*transparent/, f);
  }
});

test("Directory PDF and CSV carry people's details only", () => {
  const s = readFileSync("app/ledger/ReportsTab.tsx", "utf8");
  const pdf = s.slice(s.indexOf("function exportPDF"), s.indexOf("w.document.write(html)"));
  const csv = s.slice(s.indexOf("function exportCSV"), s.indexOf("function exportPDF"));
  for (const word of ["maintenance", "sqft", "bhk", "By:", "chargeLines"]) {
    assert.ok(!pdf.toLowerCase().includes(word.toLowerCase()), "PDF mentions " + word);
    assert.ok(!csv.toLowerCase().includes(word.toLowerCase()), "CSV mentions " + word);
  }
});
