import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const pngSize = (f: string) => { const b = readFileSync(join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("platform manifest is its own app: own id, scope and name, nothing of Aakar's", () => {
  const m = JSON.parse(read("public/platform.webmanifest"));
  assert.equal(m.id, "/platform"); assert.equal(m.start_url, "/platform"); assert.equal(m.scope, "/platform");
  assert.ok(m.start_url.startsWith(m.scope));
  assert.doesNotMatch(JSON.stringify(m), /aakar|sukh|naranpura|G-16551/i);
  const aakar = JSON.parse(read("public/manifest.webmanifest"));
  assert.notEqual(m.id, aakar.id);
  for (const i of m.icons) {
    assert.ok(existsSync(join(root, "public", i.src)), i.src);
    assert.deepEqual(pngSize("public" + i.src), i.sizes.split("x").map(Number));
    assert.doesNotMatch(i.src, /^\/icons\/(icon-192|icon-512|maskable-512)\.png$/);   // never the society app's icons
  }
  assert.ok(m.icons.some((i: any) => i.purpose === "maskable"));
});

test("platform layout points at the platform manifest, and the platform has its own tab and apple icons", () => {
  const l = read("app/platform/layout.tsx");
  assert.match(l, /manifest: "\/platform\.webmanifest"/);
  assert.match(l, /title: "AanganOne Platform"/);
  assert.deepEqual(pngSize("app/platform/apple-icon.png"), [180, 180]);
  assert.ok(existsSync(join(root, "app/platform/icon.png")));
  assert.match(read("app/layout.tsx"), /manifest: "\/manifest\.webmanifest"/);   // the society app keeps its own manifest
});

test("platform service worker: its own scope, navigations only, no data and no Aakar text, offline page inside the file", () => {
  const sw = read("public/platform-sw.js");
  assert.doesNotMatch(sw, /aakar/i);
  assert.match(sw, /req\.mode !== "navigate"/);                 // everything that is not a page goes straight to the network
  assert.doesNotMatch(sw, /caches\.(open|put|add)/);            // nothing is stored on the phone
  assert.match(sw, /Offline/);
  assert.match(read("app/platform/PlatformPwa.tsx"), /register\("\/platform-sw\.js", \{ scope: "\/platform" \}\)/);
  assert.match(read("app/ledger/PwaRegister.tsx"), /register\("\/sw\.js"\)/);  // the society app's worker is unchanged
});
