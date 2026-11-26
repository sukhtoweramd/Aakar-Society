// Permanent delete of a bill, receipt or letter (for test entries and mistakes). MAIN ADMIN only.
// GET  → { isMainAdmin }
// POST { action: "delete", kind: "bill" | "receipt" | "letter", id }
//   • a bill with any receipt (even cancelled) cannot be deleted: delete its receipts first
//   • if the deleted number was the last one issued, the series steps back so the number is used again
//   • every delete is written to the access log
// POST { action: "clear_test", last: {bill, other, rcpt, letter} } → before GO LIVE only: a backup is saved first,
//   then ALL test activity is removed (bills, receipts, letters, payment reports, letter requests, events, minutes,
//   complaints, bookings, notices, AMC, nominees — sql-security/12) and its files in R2 (lib/testClear.ts);
//   numbers are set to the last paper numbers given
// POST { action: "go_live" } → locks test clearing for ever (one row in society_live that cannot be changed)
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthedClient } from "@/lib/serverAuth";
import { buildBackup, logAccess, storeBackup } from "@/lib/backup";
import { societyCommittee } from "@/lib/mainAdmin";
import { deleteTestFiles } from "@/lib/r2Clear";
import { societyOfCaller } from "@/lib/memberships";

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
  const society = await societyOfCaller(admin, me.userId);
  return { me, admin, isMain: (await societyCommittee(admin, society)).ownerId === me.userId, society }; // the server key skips the database wall: every read and write below names this society
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, society } = g;
  const live = await admin.from("society_live").select("live_at, live_by").eq("society_id", society).eq("id", 1).maybeSingle();
  const count = async (t: string) => { const r = await admin.from(t).select("id", { count: "exact", head: true }).eq("society_id", society); return r.error ? null : r.count || 0; };
  const [bills, receipts, letters] = await Promise.all([count("bills"), count("payments"), count("letters")]);
  return NextResponse.json({ isMainAdmin: g.isMain, live: live.error ? null : live.data, needsSql: !!live.error, counts: { bills, receipts, letters } });
}

async function isLive(admin: any, society: string) {
  const r = await admin.from("society_live").select("id").eq("society_id", society).eq("id", 1).maybeSingle();
  if (r.error) throw new Error("Run BACKUP_RESTORE.sql in Supabase first.");
  return !!r.data;
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, me, isMain, society } = g;
  if (!isMain) return NextResponse.json({ error: "Only the main admin login can delete bills, receipts and letters. Others can cancel them." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "go_live") {
    try {
      if (await isLive(admin, society)) return NextResponse.json({ error: "The society is already live." }, { status: 400 });
      const { error } = await admin.from("society_live").insert([{ society_id: society, id: 1, live_by: me.email }]);
      if (error) throw error;
      await logAccess(admin, me.email, "go_live", "test clearing locked for ever", "", society);
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: e.message || "Failed" }, { status: 500 }); }
  }
  if (body.action === "clear_test") {
    try {
      if (await isLive(admin, society)) return NextResponse.json({ error: "The society is live. Test clearing is locked." }, { status: 400 });
      const L = body.last || {}, n = (v: any) => Math.max(0, parseInt(String(v), 10) || 0);
      const before = await buildBackup(admin, me.email, "manual", society);
      const key = await storeBackup(before, society);
      if (!key) return NextResponse.json({ error: "Clearing needs file storage (R2) to keep a backup first. R2 is not configured." }, { status: 500 });
      const { data, error } = await admin.rpc("clear_test_documents", { p_bill: n(L.bill), p_other: n(L.other), p_rcpt: n(L.rcpt), p_letter: n(L.letter), p_society: society });
      if (error) throw new Error(/clear_test_documents/.test(error.message) ? "Run BACKUP_RESTORE.sql and multitenant/MT_09 in Supabase first." : error.message);
      // Files only when the database step cleared everything (script 12 run); with the old function, rows such as
      // events and complaints still point at their files, so the files must stay.
      // File folders are per society (lib/r2Keys.ts): only THIS society's test files are deleted.
      const all = data && typeof data === "object" && "events" in data;
      const files = all ? await deleteTestFiles(society).catch(() => null) : null;
      const counts = Object.entries(data || {}).filter(([k]) => !(all && k === "receipts")).map(([k, v]) => `${v} ${k}`).join(", "); // "receipts" = payments
      await logAccess(admin, me.email, "test_documents_cleared", counts.slice(0, 500),
        `numbers set to bill ${n(L.bill)}, other ${n(L.other)}, receipt ${n(L.rcpt)}, letter ${n(L.letter)}; backup saved first; `
        + (all ? (files ? `${files.deleted} files deleted${files.failed ? `, ${files.failed} failed` : ""}` : "files NOT deleted (storage error)") : "old clear (run sql-security/12)"), society);
      return NextResponse.json({ ok: true, cleared: data, all, files });
    } catch (e: any) { return NextResponse.json({ error: e.message || "Failed" }, { status: 500 }); }
  }
  const k = KINDS[body.kind as keyof typeof KINDS];
  if (body.action !== "delete" || !k || typeof body.id !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const { data: row, error: e1 } = await admin.from(k.table).select("*").eq("society_id", society).eq("id", body.id).maybeSingle();
    if (e1) throw e1;
    if (!row) return NextResponse.json({ error: `${k.word} not found (already deleted?).` }, { status: 404 });
    const number: string = row[k.no];

    if (body.kind === "bill") {
      const { data: ps, error: e2 } = await admin.from("payments").select("receipt_no").eq("society_id", society).eq("bill_id", row.id);
      if (e2) throw e2;
      if (ps && ps.length) return NextResponse.json({ error: `Bill ${number} has receipt${ps.length > 1 ? "s" : ""} ${ps.map((p: any) => p.receipt_no).join(", ")}. Delete ${ps.length > 1 ? "them" : "it"} first.` }, { status: 400 });
    }

    const { error: e3 } = await admin.from(k.table).delete().eq("society_id", society).eq("id", row.id);
    if (e3) throw e3;

    // Step the series back when this was the newest number, so the next document reuses it.
    let reused = false;
    const series = body.kind === "bill" ? (row.kind === "other" ? "other" : "bill") : body.kind === "receipt" ? "rcpt" : "letter";
    const pf = `${series}_prefix`, lf = `${series}_last_no`;
    const { data: s } = await admin.from("billing_settings").select("*").eq("society_id", society).eq("id", 1).maybeSingle();
    if (s && s[pf] != null) {
      const last = Number(s[lf]) || 0;
      if (last > 0 && number === `${s[pf]}${String(last).padStart(Number(s.num_digits) || 4, "0")}`) {
        const { data: upd } = await admin.from("billing_settings").update({ [lf]: last - 1 }).eq("society_id", society).eq("id", 1).eq(lf, last).select("id");
        reused = !!upd?.length;
      }
    }

    const what = [`Flat ${row.flat_id}`, row.amount != null ? `₹${row.amount}` : "", row.subject || "", row.status === "cancelled" ? "was cancelled" : ""].filter(Boolean).join(", ");
    await logAccess(admin, me.email, `deleted_${body.kind}`, number, what + (reused ? "; number will be used again" : ""), society);
    return NextResponse.json({ ok: true, number, reused });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
