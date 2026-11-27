// Installed-app manifest of a society's own address (/<word>): its name and icons. Public on purpose (same facts as the login page shows).
// The first society (and any unknown word) gets the static manifest of the app. No server key, no resident data.
import { NextRequest, NextResponse } from "next/server";
import { ownFilesWord, societyManifest } from "@/lib/societyPwa";
import { publicSociety } from "@/lib/societyPublicServer";

export async function GET(req: NextRequest, ctx: { params: Promise<{ word: string }> }) {
  const { word: raw } = await ctx.params;
  const word = ownFilesWord(raw);
  const s = word ? await publicSociety(word) : null;
  if (!s) return NextResponse.redirect(new URL("/manifest.webmanifest", req.url), 307);
  return new NextResponse(JSON.stringify(societyManifest(s)), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
