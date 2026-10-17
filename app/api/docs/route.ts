// Permanent delete of a bill, receipt or letter (for test entries and mistakes). MAIN ADMIN only.
// GET  → { isMainAdmin }
// POST { action: "delete", kind: "bill" | "receipt" | "letter", id }
//   • a bill with any receipt (even cancelled) cannot be deleted: delete its receipts first
//   • if the deleted number was the last one issued, the series steps back so the number is used again
//   • every delete is written to the access log
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { allUsers, isCommitteeUser, logAccess, mainAdminId } from "@/lib/backup";

export const dynamic = "force-dynamic";

const KINDS = {
  bill: { table: "bills", no: "bill_no", word: "Bill" },
  receipt: { table: "payments", no: "receipt_no", word: "Receipt" },
  letter: { table: "letters", no: "ref_no", word: "Letter" },
} as const;

async function guard(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return { error: NextResponse.json({ error: "Please log in again." }, { status: 401 }) };
  if (!me.isCommittee) return { error: NextResponse.json({ error: "Committee only." }, { status: 403 }) };
  const admin = getAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set in Vercel environment variables." }, { status: 500 }) };
  const committee = (await allUsers(admin)).filter(isCommitteeUser);
  return { me, admin, isMain: mainAdminId(committee) === me.userId };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  return NextResponse.json({ isMainAdmin: g.isMain });
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me, isMain } = g;
  if (!isMain) return NextResponse.json({ error: "Only the main admin login can delete bills, receipts and letters. Others can cancel them." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const k = KINDS[body.kind as keyof typeof KINDS];
  if (body.action !== "delete" || !k || typeof body.id !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const { data: row, error: e1 } = await admin.from(k.table).select("*").eq("id", body.id).maybeSingle();
    if (e1) throw e1;
    if (!row) return NextResponse.json({ error: `${k.word} not found (already deleted?).` }, { status: 404 });
    const number: string = row[k.no];

    if (body.kind === "bill") {
      const { data: ps, error: e2 } = await admin.from("payments").select("receipt_no").eq("bill_id", row.id);
      if (e2) throw e2;
      if (ps && ps.length) return NextResponse.json({ error: `Bill ${number} has receipt${ps.length > 1 ? "s" : ""} ${ps.map((p: any) => p.receipt_no).join(", ")}. Delete ${ps.length > 1 ? "them" : "it"} first.` }, { status: 400 });
    }

    const { error: e3 } = await admin.from(k.table).delete().eq("id", row.id);
    if (e3) throw e3;

    // Step the series back when this was the newest number, so the next document reuses it.
    let reused = false;
    const series = body.kind === "bill" ? (row.kind === "other" ? "other" : "bill") : body.kind === "receipt" ? "rcpt" : "letter";
    const pf = `${series}_prefix`, lf = `${series}_last_no`;
    const { data: s } = await admin.from("billing_settings").select("*").eq("id", 1).maybeSingle();
    if (s && s[pf] != null) {
      const last = Number(s[lf]) || 0;
      if (last > 0 && number === `${s[pf]}${String(last).padStart(Number(s.num_digits) || 4, "0")}`) {
        const { data: upd } = await admin.from("billing_settings").update({ [lf]: last - 1 }).eq("id", 1).eq(lf, last).select("id");
        reused = !!upd?.length;
      }
    }

    const what = [`Flat ${row.flat_id}`, row.amount != null ? `₹${row.amount}` : "", row.subject || "", row.status === "cancelled" ? "was cancelled" : ""].filter(Boolean).join(", ");
    await logAccess(admin, me.email, `deleted_${body.kind}`, number, what + (reused ? "; number will be used again" : ""));
    return NextResponse.json({ ok: true, number, reused });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
