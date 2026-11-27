// Server only. The icon drawer (next/og) cannot read WEBP pictures, and the browser sometimes saves a logo as WEBP (lib/logoImage.ts).
// PNG / JPEG logos are used as they are; a WEBP one is turned into PNG with `sharp` (the image tool Next.js already uses); if that is not
// possible the icon falls back to the first letter instead of failing. Input must already have passed safeLogo().
export async function iconReadyLogo(logo: string): Promise<string> {
  if (!logo) return "";
  if (!logo.startsWith("data:image/webp;")) return logo;
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(logo.split(",")[1] || "", "base64")).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch { return ""; }
}
