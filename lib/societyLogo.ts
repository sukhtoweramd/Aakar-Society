// Society logo (27 Nov 2026). Pure helpers (no database import), so tests can load them.
// The logo is a small square picture kept on society_profile.logo_image as a data URL (MT_19). What a screen shows:
//   - the society's own logo when it has one;
//   - no logo: the FIRST society keeps its Om sign (as before); every other society shows the first letter of its name.
import { SOCIETY } from "./society";
import { usesLegacyAddress, wordFromPath } from "./societyWord";

export const FIRST_SOCIETY_MARK = "ॐ";   // the Om sign the first society has always shown
export const LOGO_MAX_CHARS = 120000;          // same limit as the database check (society_profile_logo_size)
export const LOGO_TARGET_CHARS = 60000;        // the browser squeezes the picture below this

export type Mark = { kind: "image"; src: string } | { kind: "text"; text: string };

/** A usable logo: a PNG / JPEG / WEBP data URL within the size limit; anything else is "" (never put into a page). */
export function safeLogo(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > LOGO_MAX_CHARS) return "";
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s) ? s : "";
}

/** First letter or digit of the name, in capitals ("Test Park" -> "T"); "S" when the name has none. */
export function initialOf(name: string | null | undefined): string {
  const m = String(name || "").match(/[0-9A-Za-z\u00C0-\u024F\u0900-\u097F\u0A80-\u0AFF]/);
  return m ? m[0].toUpperCase() : "S";
}

export function markOf(o: { logo?: string | null; name?: string | null; first: boolean }): Mark {
  const src = safeLogo(o.logo);
  if (src) return { kind: "image", src };
  return { kind: "text", text: o.first ? FIRST_SOCIETY_MARK : initialOf(o.name) };
}

/** The mark of the society whose app is open now (SOCIETY is the profile applied after login; the address word says whether it is the first society). */
export function currentMark(): Mark {
  const first = typeof window === "undefined" ? true : usesLegacyAddress(wordFromPath(window.location.pathname));
  return markOf({ logo: SOCIETY.logo, name: SOCIETY.name, first });
}

/** The sentence under LOGO in ADMIN when no logo is saved: the first society keeps its Om sign, every other one shows its first letter. */
export const noLogoText = (first: boolean) => first
  ? "No logo yet. Until you add one, the Om sign is shown."
  : "No logo yet. Until you add one, the first letter of the society name is shown.";

const escText = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** For the round seal on printed papers: the picture filling the circle, or the sign / letter. */
export function sealHtml(m: Mark = currentMark()): string {
  return m.kind === "image" ? `<img class="logo" src="${m.src}" alt="">` : escText(m.text);
}

/** For the heading of a printed list ("ॐ SOCIETY NAME"): a small picture or the sign, then a space; nothing for a society without a logo that is not the first. */
export function titleMarkHtml(m: Mark = currentMark(), first = typeof window === "undefined" ? true : usesLegacyAddress(wordFromPath(window.location.pathname))): string {
  if (m.kind === "image") return `<img src="${m.src}" alt="" style="height:1.15em;width:1.15em;object-fit:contain;vertical-align:-.2em;margin-right:.35em;border-radius:50%">`;
  return first ? `${escText(m.text)} ` : "";
}

/** CSS for `.seal img.logo` on printed papers. */
export const SEAL_IMG_CSS = ".seal{overflow:hidden}.seal img.logo{width:100%;height:100%;object-fit:contain;display:block}";
