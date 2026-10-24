// Short-lived signed links for stored files (notices, vault, flat documents, minutes, AMC, event papers and photos,
// floor plans). The screen sends the stored links (old public addresses or keys); each one it may open comes back as
// a signed link, the rest as null. Checked with the login, like /api/payment-proof.
// POST { refs: string[], purpose?: "open" | "show" }  → { links: { [ref]: url | null }, seconds }
//   open = a file opened with a click (2 minutes); show = pictures on the page (10 minutes)
import { NextRequest, NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/serverAuth";
import { getR2 } from "@/lib/r2Client";
import { linksFor, OPEN_SECONDS, SHOW_SECONDS } from "@/lib/r2Access";

export const dynamic = "force-dynamic";
const MAX_REFS = 100;

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (!getR2()) return NextResponse.json({ error: "File storage (R2) is not configured." }, { status: 500 });
  const body: any = await req.json().catch(() => ({}));
  const refs = Array.isArray(body?.refs) ? Array.from(new Set(body.refs.filter((r: any) => typeof r === "string" && r))) as string[] : [];
  if (!refs.length || refs.length > MAX_REFS) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const seconds = body?.purpose === "open" ? OPEN_SECONDS : SHOW_SECONDS;
  try {
    const links = await linksFor(me, refs, seconds);
    return NextResponse.json({ links, seconds }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: "Could not prepare the file link." }, { status: 500 });
  }
}
