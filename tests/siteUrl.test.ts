import test from "node:test";
import assert from "node:assert/strict";
import { SOCIETY, siteUrl } from "../lib/society";

// The address printed on login slips and messages must carry the society word, because a flat login ("A-101") is looked up inside the society named in the address.
function withWindow(pathname: string, fn: () => void) {
  const g = globalThis as any; const old = g.window;
  g.window = { location: { origin: "https://app.example", pathname } };
  try { fn(); } finally { g.window = old; }
}

test("siteUrl: a set public_url wins; otherwise the address in use, with the society word when there is one", () => {
  const saved = SOCIETY.publicUrl;
  try {
    SOCIETY.publicUrl = "https://set.example/sample-gardens";
    withWindow("/", () => assert.equal(siteUrl(), "https://set.example/sample-gardens"));
    SOCIETY.publicUrl = "";
    withWindow("/sample-gardens", () => assert.equal(siteUrl(), "https://app.example/sample-gardens"));
    withWindow("/sample-gardens/x", () => assert.equal(siteUrl(), "https://app.example/sample-gardens"));
    withWindow("/", () => assert.equal(siteUrl(), "https://app.example"));
    withWindow("/ledger", () => assert.equal(siteUrl(), "https://app.example")); // an app page is not a society word
  } finally { SOCIETY.publicUrl = saved; }
});
