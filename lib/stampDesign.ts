// Society stamp design (27 Nov 2026). Pure: builds the round stamp as SVG text from a few choices + the society profile.
// The default design reproduces the built-in round blue stamp exactly (tests/stampDesign.test.ts). Empty parts are left out
// (a society with no registration number or founding year never prints a dangling "REG. NO." or "EST.").
import { safeLogo } from "./societyLogo";

export const STAMP_COLORS = { blue: "#1f3a93", navy: "#0f1d3d", red: "#b3261e", green: "#1b6b3a", black: "#222222" } as const;
export type StampColor = keyof typeof STAMP_COLORS;
export type StampDesign = {
  color: StampColor;
  centre: "reg" | "logo" | "building";   // what stands in the middle circle
  ring: "full" | "short";                // top ring text: the full name or the short name
  city: boolean;                         // "★ CITY ★" along the bottom
  year: boolean;                         // "EST. 1994" under the middle text
};
export const DEFAULT_STAMP_DESIGN: StampDesign = { color: "blue", centre: "reg", ring: "full", city: true, year: true };

/** Whatever the database holds (null, a wrong shape, an unknown value) -> a complete, valid design. */
export function normalizeDesign(raw: unknown): StampDesign {
  const d = DEFAULT_STAMP_DESIGN;
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    color: typeof o.color === "string" && o.color in STAMP_COLORS ? (o.color as StampColor) : d.color,
    centre: o.centre === "logo" || o.centre === "building" || o.centre === "reg" ? o.centre : d.centre,
    ring: o.ring === "short" || o.ring === "full" ? o.ring : d.ring,
    city: typeof o.city === "boolean" ? o.city : d.city,
    year: typeof o.year === "boolean" ? o.year : d.year,
  };
}

export type StampSociety = { full: string; name: string; city: string; reg: string; building: string; year: string; logo?: string };

const x = (t: string) => String(t ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!));
const fit = (text: string, base: number, maxChars: number, min: number) => (text.length <= maxChars ? base : Math.max(min, Math.round((base * maxChars) / text.length)));

export function stampSvg(design: StampDesign, s: StampSociety): string {
  const c = STAMP_COLORS[design.color];
  const a = (r: number, deg: number) => { const t = (deg * Math.PI) / 180; return `${(300 + r * Math.cos(t)).toFixed(1)},${(300 + r * Math.sin(t)).toFixed(1)}`; };
  const ringText = design.ring === "short" ? s.name.toUpperCase() : s.full.replace(/\bSOCIETY\b/i, "SOC.");
  const logo = design.centre === "logo" ? safeLogo(s.logo) : "";
  const centre: "reg" | "logo" | "building" = design.centre === "logo" && !logo ? "reg" : design.centre;
  const useBuilding = centre === "building" || (centre === "reg" && !s.reg.trim());
  const middle = useBuilding ? s.building.trim().toUpperCase() : s.reg.trim();
  const yearText = design.year && s.year ? `EST. ${s.year}` : "";
  const cityText = design.city && s.city.trim() ? s.city.toUpperCase() : "";

  let inner = "";
  if (logo) {
    inner = `<clipPath id="lg"><circle cx="300" cy="300" r="150"/></clipPath><image href="${logo}" x="150" y="150" width="300" height="300" preserveAspectRatio="xMidYMid meet" clip-path="url(#lg)"/>`;
  } else if (middle || yearText) {
    inner = `<g fill="${c}" text-anchor="middle" font-family="Inter,Arial,sans-serif">`
      + (middle && !useBuilding ? `<text x="300" y="268" font-size="26" font-weight="700" letter-spacing="6">REG. NO.</text>` : "")
      + (middle ? `<text x="300" y="${useBuilding ? 318 : 328}" font-size="${useBuilding ? fit(middle, 52, 12, 26) : 58}" font-weight="800" letter-spacing="2">${x(middle)}</text>` : "")
      + (middle && yearText ? `<line x1="200" y1="350" x2="400" y2="350" stroke="${c}" stroke-width="3"/>` : "")
      + (yearText ? `<text x="300" y="${middle ? 392 : 316}" font-size="30" font-weight="700" letter-spacing="6">${x(yearText)}</text>` : "")
      + `</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><path id="t" d="M ${a(218, 148)} A 218,218 0 1,1 ${a(218, 32)}"/><path id="b" d="M 52,300 A 248,248 0 0,0 548,300"/></defs>
  <g fill="none" stroke="${c}"><circle cx="300" cy="300" r="286" stroke-width="12"/><circle cx="300" cy="300" r="268" stroke-width="3"/><circle cx="300" cy="300" r="166" stroke-width="5"/></g>
  <g font-family="Inter,Arial,sans-serif" font-weight="800" fill="${c}"><text font-size="${fit(ringText, 44, 30, 26)}" letter-spacing="4"><textPath href="#t" startOffset="50%" text-anchor="middle">${x(ringText)}</textPath></text>`
    + (cityText ? `\n  <text font-size="34" letter-spacing="6"><textPath href="#b" startOffset="50%" text-anchor="middle">★  ${x(cityText)}  ★</textPath></text>` : "")
    + `</g>\n  ${inner}</svg>`;
}

export const stampDataUrl = (design: StampDesign, s: StampSociety) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stampSvg(design, s))}`;
