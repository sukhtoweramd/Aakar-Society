// Society's own picture behind printed papers (27 Nov 2026). Pure size / type rules; the picture is made faint in the browser (lib/backgroundImage.ts).
// Which picture prints: the society's own (billing_settings.print_background); else the FIRST society's building (public/print/building-bg.jpg);
// else none (every other society's papers stay plain).
export const BG_MAX_CHARS = 250000;      // same limit as the database check (billing_settings_bg_size)
export const BG_TARGET_CHARS = 150000;   // the browser squeezes the picture below this

/** A usable background: a JPEG / PNG / WEBP data URL within the size limit; anything else is "" (never put into a page). */
export function safeBackground(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > BG_MAX_CHARS) return "";
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s) ? s : "";
}

/** The picture to print, or "" for none. */
export function backgroundSrc(custom: string, firstSociety: boolean): string {
  return custom || (firstSociety ? "/print/building-bg.jpg" : "");
}
