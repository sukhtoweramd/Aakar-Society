// Paper background picture, in the browser (27 Nov 2026): any photo -> a faint JPEG (about 900 px) small enough for the database.
// Not pure (uses a canvas), so tests do not import it; the size rules live in lib/printBackground.ts.
import { BG_TARGET_CHARS } from "./printBackground";

export function fadedBackground(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { reject(new Error("Choose a PNG, JPEG or WEBP picture.")); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error("That picture is too large (over 12 MB). Choose a smaller one.")); return; }
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that picture.")); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const side of [900, 700, 520]) {
        const k = Math.min(1, side / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d"); if (!g) break;
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        g.fillStyle = "rgba(255,255,255,0.86)"; g.fillRect(0, 0, w, h);   // faint, like a watermark: text on the paper stays readable
        for (const q of [0.7, 0.55, 0.4]) { const u = c.toDataURL("image/jpeg", q); if (/^data:image\/jpeg;/.test(u) && u.length <= BG_TARGET_CHARS) { resolve(u); return; } }
      }
      reject(new Error("The picture is too detailed to keep small. Use a simpler picture."));
    };
    img.src = url;
  });
}
