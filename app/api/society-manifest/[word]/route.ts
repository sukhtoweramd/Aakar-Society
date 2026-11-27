// Installed-app manifest of a society's own address (/<word>): its name and icons. Public on purpose (same facts as the login page shows).
// The first society (and any unknown word) gets the static manifest of the app. No server key, no resident data.
import { NextRequest, NextResponse } from "next/server";
import { fallbackSociety, ownFilesWord, societyManifest } from "@/lib/societyPwa";
import { lookupSociety } from "@/lib/societyPublicServer";

export async function GET(req: NextRequest, ctx: { params: Promise<{ word: string }> }) {
  const { word: raw } = await ctx.params;
  const word = ownFilesWord(raw);
  if (!word) return NextResponse.redirect(new URL("/manifest.webmanifest", req.url), 307);
  const { society, failed } = await lookupSociety(word);
  if (!society && !failed) return NextResponse.redirect(new URL("/manifest.webmanifest", req.url), 307);   // the lookup worked: there is no such society
  // Lookup failed: answer with a name made from the address word and do not let anyone cache it (never the first society's identity).
  return new NextResponse(JSON.stringify(societyManifest(society || fallbackSociety(word))), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": society ? "public, max-age=300, s-maxage=300" : "no-store" } });
}
