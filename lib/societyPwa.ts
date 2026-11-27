// Installed-app (PWA) identity per society (27 Nov 2026). Pure helpers, no database import, so tests can load this file.
// The FIRST society keeps the static files (public/manifest.webmanifest, public/icons/*): nothing changes for Aakar.
// Every other society gets a manifest and icons built from its own name and logo (routes under app/api/society-manifest and society-icon).
import { initialOf, safeLogo } from "./societyLogo";
import { cleanWord, usesLegacyAddress } from "./societyWord";

export type PublicSociety = { slug: string; name: string; logo?: string | null };
export const ICON_SIZES = ["180", "192", "512", "maskable-512"] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const isIconSize = (s: string): s is IconSize => (ICON_SIZES as readonly string[]).includes(s);

/** Home-screen label: the society name, kept short enough not to be cut off (about 12 characters; cut at a word where possible). */
export function shortNameOf(name: string | null | undefined): string {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "Society";
  if (n.length <= 12) return n;
  const words = n.split(" ");
  let out = words[0];
  for (const w of words.slice(1)) { if ((out + " " + w).length > 12) break; out += " " + w; }
  return out.slice(0, 12);
}

/** The letter drawn on the icon when there is no logo. The icon font has no Gujarati / Hindi letters, so those fall back to the first Latin letter or digit, else "S". */
export function iconLetter(name: string | null | undefined): string {
  const l = initialOf(name);
  if (/^[0-9A-ZÀ-ÖØ-Þ]$/.test(l)) return l;
  const m = String(name || "").match(/[0-9A-Za-z]/);
  return m ? m[0].toUpperCase() : "S";
}

/** The web app manifest of one society. Address /<word>, own name and icons. */
export function societyManifest(s: PublicSociety) {
  const w = s.slug, name = String(s.name || "").trim() || w;
  return {
    name, short_name: shortNameOf(name), description: `${name} society app`,
    id: `/${w}`, start_url: `/${w}`, scope: `/${w}`,
    display: "standalone", orientation: "any", background_color: "#fdfcf5", theme_color: "#0f1d3d", lang: "en-IN",
    icons: [
      { src: `/api/society-icon/${w}/192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/api/society-icon/${w}/512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/api/society-icon/${w}/maskable-512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** Drawing plan of an icon: size in pixels, and how much of it the logo / letter fills (a maskable icon keeps a safe margin because phones crop it). */
export function iconPlan(size: IconSize) {
  const px = size === "180" ? 180 : size === "192" ? 192 : 512;
  const maskable = size === "maskable-512";
  const inner = Math.round(px * (maskable ? 0.58 : 0.74));
  return { px, maskable, inner };
}

/** For the routes: which word is asked, and whether it is a society that gets its own files (not the first society, not a reserved word). */
export function ownFilesWord(raw: string | null | undefined): string | null {
  const w = cleanWord(raw);
  return w && !usesLegacyAddress(w) ? w : null;
}

export { safeLogo };
