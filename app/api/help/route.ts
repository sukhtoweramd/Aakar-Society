// HELP assistant: answers members' questions about the app ONLY from content/help-kb.md, using Cloudflare Workers AI
// (the same account and token as screenshot reading). Nothing is stored. Questions about money or a specific flat's data
// are not looked up here; the assistant only explains how to use the app.
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/serverAuth";
import { pickGuide } from "@/lib/helpSections";
import { SOCIETY, societyShort, titleCase } from "@/lib/society";
import { applySocietyProfile, profileFromRow } from "@/lib/societySetup";
import { duesFacts, wantsOwnMoney } from "@/lib/helpData";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MODELS = ["@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-3.1-8b-instruct"];
let FILE_KB = "";
/** The built-in guide shipped with the app (used until the committee saves one in ADMIN → HELP GUIDE). */
function builtInGuide() {
  if (!FILE_KB) { try { FILE_KB = readFileSync(path.join(process.cwd(), "content", "help-kb.md"), "utf8"); } catch { FILE_KB = ""; } }
  return FILE_KB;
}
async function guideFor(db: any): Promise<string> {
  const { data } = await db.from("help_guide").select("content").eq("id", 1).maybeSingle();
  return (data?.content as string) || builtInGuide();
}

/** GET: the built-in guide, for the ADMIN editor's starting text / reset (committee only). */
export async function GET(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me?.isCommittee) return NextResponse.json({ error: "Only the committee can do this." }, { status: 403 });
  return NextResponse.json({ content: builtInGuide() });
}
// very small guard against loops / misuse (per server instance)
const recent = new Map<string, number[]>();
function tooMany(user: string) {
  const now = Date.now(); const list = (recent.get(user) || []).filter((t) => now - t < 60_000);
  list.push(now); recent.set(user, list);
  return list.length > 12;
}

export async function POST(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const account = (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "").trim();
  const token = (process.env.CLOUDFLARE_AI_TOKEN || "").replace(/^Bearer\s+/i, "").trim();
  const KB = await guideFor(me.db).catch(() => builtInGuide());
  if (!account || !token || !KB) return NextResponse.json({ error: "Help is not set up yet." }, { status: 503 });
  if (tooMany(me.userId)) return NextResponse.json({ error: "Too many questions in a minute. Please wait a little." }, { status: 429 });
  const body: any = await req.json().catch(() => ({}));
  const question = String(body?.question || "").trim().slice(0, 600);
  if (!question) return NextResponse.json({ error: "Type a question." }, { status: 400 });
  // Send only the parts of the guide that match the question (plus the overview); the earlier questions help pick them too.
  const lastUser = (Array.isArray(body?.history) ? body.history : []).filter((m: any) => m?.role === "user").slice(-1)[0]?.text || "";
  const guide = pickGuide(KB, `${question} ${question.length < 40 ? String(lastUser).slice(0, 200) : ""}`);
  const history = (Array.isArray(body?.history) ? body.history : []).slice(-4)
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.text === "string")
    .map((m: any) => ({ role: m.role, content: String(m.text).slice(0, 1200) }));

  const who = me.isCommittee ? "a society committee member (committee login)" : me.isTenant ? `the tenant of flat ${me.tenantFlatId || ""} (tenant login: family, vehicles, complaints, common plot booking, notices, events and contacts; no bills, documents or nominees)` : `a member using the flat login of flat ${me.flatId || ""}`;
  // one society per deployment: the profile (ADMIN → FLAT SETUP) gives the name; no row / unreadable = today's values
  try { const { data: prof } = await me.db.from("society_profile").select("*").maybeSingle(); applySocietyProfile(profileFromRow(prof)); } catch { /* keep the current values */ }
  // A flat login asking about its own amounts: read the flat's bills and payments through the member's OWN login (the database
  // rules limit them to that flat) and give the assistant a short summary. Tenants, committee logins and other questions get no data.
  let dataBlock = "";
  if (me.flatId && !me.isCommittee && !me.isTenant && wantsOwnMoney(question)) {
    try {
      const [b, p] = await Promise.all([me.db.from("bills").select("id, bill_no, bill_date, due_date, period_from, period_to, amount, status, tenant_bill").eq("flat_id", me.flatId), me.db.from("payments").select("bill_id, amount, paid_on, mode, receipt_no, status").eq("flat_id", me.flatId)]);
      if (!b.error && !p.error) dataBlock = `\n\nYOUR FLAT'S AMOUNTS (live data for flat ${me.flatId}, read just now; use it for questions about this flat's bills, dues and payments):\n${duesFacts((b.data as any[]) || [], (p.data as any[]) || [], new Date().toISOString().slice(0, 10))}`;
    } catch { /* no data: the assistant says where to look */ }
  }
  const baseSystem = `You are the HELP assistant inside the ${societyShort()} app${SOCIETY.building ? ` (${titleCase(SOCIETY.building)})` : ""}.
You are talking to ${who}.
Answer ONLY using the HELP GUIDE below. Do not invent screens, buttons, rules, amounts, names or phone numbers that are not in the guide.
Reply in the same language as the question (English, Gujarati or Hindi). Keep button and tab names in English capitals exactly as in the guide (for example I HAVE PAID, MY FLAT).
Give a complete, helpful answer: explain what the screen or feature shows and the steps to use it, as numbered steps where there are steps (up to about 12 short lines). No greetings, no closing lines.
Mention ONLY tabs, buttons and fields that appear in the guide, spelled exactly as in the guide. If the guide does not say how to do something, do not guess a path.
Only the "YOUR FLAT'S AMOUNTS" block, when it is present, is live data: quote it exactly, never work out other amounts, and say where in the app to see the bill or receipt. You cannot see anything else (other flats, other records); if asked, tell them where in the app to look.
Never ask for passwords, OTPs, bank account or card numbers.
If the guide does not answer the question, or the member reports an error or something broken, reply with exactly NOT_FOUND on the first line, then one short sentence in the member's language suggesting they contact the app coordinator.

HELP GUIDE (the parts that match the question):
${guide}`;

  const errors: string[] = [];
  const system = baseSystem + dataBlock;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "system", content: system }, ...history, { role: "user", content: question }], max_tokens: 700, temperature: 0.2 }),
        signal: AbortSignal.timeout(14000),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) { errors.push(`${model.split("/").pop()}: ${j?.errors?.[0]?.message || res.status}`); continue; }
      let text = String(j.result?.response ?? "").trim();
      if (!text) { errors.push(`${model.split("/").pop()}: empty`); continue; }
      const notFound = /^\s*NOT_FOUND\b/i.test(text);
      text = text.replace(/^\s*NOT_FOUND\s*[:\-]?\s*/i, "").trim();
      return NextResponse.json({ answer: text, notFound });
    } catch (e: any) { errors.push(`${model.split("/").pop()}: ${e?.name === "TimeoutError" ? "no answer in 14 s" : e?.message}`); }
  }
  console.error("help AI errors:", errors.join(" | "));
  return NextResponse.json({ error: "Help is not answering right now. Please try again in a minute, or contact the app coordinator.", detail: errors.join(" | ") }, { status: 502 });
}
