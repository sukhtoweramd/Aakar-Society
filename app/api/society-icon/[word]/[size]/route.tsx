// Home-screen icon of a society's own address: its logo (or the first letter of its name) on the app's navy. PNG, public on purpose.
// The first society and any unknown word get the static icon files of the app. No server key, no resident data.
import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { iconLetter, iconPlan, isIconSize, ownFilesWord, safeLogo } from "@/lib/societyPwa";
import { publicSociety } from "@/lib/societyPublicServer";
import { iconReadyLogo } from "@/lib/iconLogo";

const STATIC: Record<string, string> = { "180": "/icons/apple-touch-icon.png", "192": "/icons/icon-192.png", "512": "/icons/icon-512.png", "maskable-512": "/icons/maskable-512.png" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ word: string; size: string }> }) {
  const { word: raw, size } = await ctx.params;
  if (!isIconSize(size)) return new NextResponse("Not found", { status: 404 });
  const word = ownFilesWord(raw);
  const s = word ? await publicSociety(word) : null;
  if (!s) return NextResponse.redirect(new URL(STATIC[size], req.url), 307);
  const { px, maskable, inner } = iconPlan(size);
  const logo = await iconReadyLogo(safeLogo(s.logo));
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1d3d" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={inner} height={inner} alt="" style={{ width: inner, height: inner, borderRadius: maskable ? 0 : inner / 2, objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: inner, height: inner, borderRadius: inner / 2, border: `${Math.max(3, Math.round(px / 60))}px solid #d4af37`, color: "#d4af37", fontSize: Math.round(inner * 0.62), fontWeight: 700 }}>
            {iconLetter(s.name)}
          </div>
        )}
      </div>
    ),
    { width: px, height: px, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
