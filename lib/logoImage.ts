// Society logo picture (27 Nov 2026), in the browser: any PNG / JPEG / WEBP photo -> a small square picture (data URL) the database can keep.
// Not pure (uses a canvas), so tests do not import it; the size rules live in lib/societyLogo.ts.
import { LOGO_TARGET_CHARS } from "./societyLogo";

export const LOGO_FILE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Fit the picture inside a square (transparent around it), squeeze it under LOGO_TARGET_CHARS; throws a plain message when that is not possible. */
export function squareLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!LOGO_FILE_TYPES.includes(file.type)) { reject(new Error("Choose a PNG, JPEG or WEBP picture.")); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error("That picture is too large (over 8 MB). Choose a smaller one.")); return; }
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that picture.")); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const side of [256, 192, 128]) {
        const c = document.createElement("canvas"); c.width = side; c.height = side;
        const g = c.getContext("2d"); if (!g) break;
        const k = Math.min(side / img.width, side / img.height);
        const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        g.clearRect(0, 0, side, side); g.drawImage(img, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
        const tries = [c.toDataURL("image/png"), c.toDataURL("image/webp", 0.9), c.toDataURL("image/webp", 0.75)];
        const best = tries.filter((t) => /^data:image\/(png|webp);/.test(t)).sort((a, b) => a.length - b.length)[0];
        if (best && best.length <= LOGO_TARGET_CHARS) { resolve(best); return; }
      }
      reject(new Error("The picture is too detailed to keep small. Use a simpler logo, ideally a flat square picture."));
    };
    img.src = url;
  });
}
