// Permanent delete of a bill, receipt or letter (for test entries and mistakes). MAIN ADMIN only.
// GET  → { isMainAdmin }
// POST { action: "delete", kind: "bill" | "receipt" | "letter", id }
//   • a bill with any receipt (even cancelled) cannot be deleted: delete its receipts first
//   • if the deleted number was the last one issued, the series steps back so the number is used again
//   • every delete is written to the access log
// POST { action: "clear_test", last: {bill, other, rcpt, letter} } → before GO LIVE only: a backup is saved first,
//   then ALL bills, receipts and letters are removed and the numbers set to the last paper numbers given
// POST { action: "go_live" } → locks test clearing for ever (one row in society_live that cannot be changed)
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { allUsers, buildBackup, isCommitteeUser, logAccess, mainAdminId, storeBackup } from "@/lib/backup";

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
  const { admin } = g;
  const live = await admin.from("society_live").select("live_at, live_by").eq("id", 1).maybeSingle();
  const count = async (t: string) => { const r = await admin.from(t).select("id", { count: "exact", head: true }); return r.error ? null : r.count || 0; };
  const [bills, receipts, letters] = await Promise.all([count("bills"), count("payments"), count("letters")]);
  return NextResponse.json({ isMainAdmin: g.isMain, live: live.error ? null : live.data, needsSql: !!live.error, counts: { bills, receipts, letters } });
}

async function isLive(admin: any) {
  const r = await admin.from("society_live").select("id").eq("id", 1).maybeSingle();
  if (r.error) throw new Error("Run BACKUP_RESTORE.sql in Supabase first.");
  return !!r.data;
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me, isMain } = g;
  if (!isMain) return NextResponse.json({ error: "Only the main admin login can delete bills, receipts and letters. Others can cancel them." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "go_live") {
    try {
      if (await isLive(admin)) return NextResponse.json({ error: "The society is already live." }, { status: 400 });
      const { error } = await admin.from("society_live").insert([{ id: 1, live_by: me.email }]);
      if (error) throw error;
      await logAccess(admin, me.email, "go_live", "test clearing locked for ever");
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: e.message || "Failed" }, { status: 500 }); }
  }
  if (body.action === "clear_test") {
    try {
      if (await isLive(admin)) return NextResponse.json({ error: "The society is live. Test clearing is locked." }, { status: 400 });
      const L = body.last || {}, n = (v: any) => Math.max(0, parseInt(String(v), 10) || 0);
      const before = await buildBackup(admin, me.email, "manual");
      const key = await storeBackup(before);
      if (!key) return NextResponse.json({ error: "Clearing needs file storage (R2) to keep a backup first. R2 is not configured." }, { status: 500 });
      const { data, error } = await admin.rpc("clear_test_documents", { p_bill: n(L.bill), p_other: n(L.other), p_rcpt: n(L.rcpt), p_letter: n(L.letter) });
      if (error) throw new Error(/clear_test_documents/.test(error.message) ? "Run BACKUP_RESTORE.sql in Supabase first." : error.message);
      await logAccess(admin, me.email, "test_documents_cleared", `${data.bills} bills, ${data.receipts} receipts, ${data.letters} letters`,
        `numbers set to bill ${n(L.bill)}, other ${n(L.other)}, receipt ${n(L.rcpt)}, letter ${n(L.letter)}; backup saved first`);
      return NextResponse.json({ ok: true, cleared: data });
    } catch (e: any) { return NextResponse.json({ error: e.message || "Failed" }, { status: 500 }); }
  }
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
