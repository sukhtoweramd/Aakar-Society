// Server only. Decides which R2 files a login may open and hands out short-lived signed links for them.
// The signed link is made with the R2 keys (S3 API), so it keeps working after the bucket's public access
// is turned off. Rules: lib/r2Keys.ts.
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Authed } from "./serverAuth";
import { getR2Signer } from "./r2Client";
import { folderAccess, parseFileRef, rowFolder, storedForms } from "./r2Keys";

/** How long a link works. Pictures and file lists: 10 minutes. A file opened with a click: 2 minutes. */
export const SHOW_SECONDS = 600;
export const OPEN_SECONDS = 120;

/** Every public R2 address the app has stored in rows (used only to read old links, never to serve files). */
export function publicBases(): string[] {
  return [process.env.R2_PUBLIC_URL, process.env.CLOUDFLARE_R2_PUBLIC_URL]
    .map((v) => String(v || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export async function signKey(key: string, seconds = SHOW_SECONDS): Promise<string | null> {
  const r2 = getR2Signer();
  if (!r2) return null;
  return getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: key }), { expiresIn: seconds });
}

type Me = Pick<Authed, "isCommittee" | "flatId" | "db" | "isTenant" | "tenantFlatId">;

/** Is this flat on the organising team of the event (Convenor / Treasurer / Member)? */
async function onEventTeam(me: Me, eventId: string, memo: Map<string, Promise<boolean>>) {
  if (!me.flatId) return false;
  if (!memo.has(eventId)) {
    memo.set(eventId, Promise.resolve(me.db.rpc("my_event_role", { p_event: eventId }))
      .then(({ data, error }: any) => !error && !!data).catch(() => false));
  }
  return memo.get(eventId)!;
}

/** stored link → the folders it may open (a link counts only inside the folder of the row that holds it). */
type Seen = Map<string, Set<string>>;
const addSeen = (seen: Seen, link: any, folder: string | null) => {
  if (!link || !folder) return;
  const k = String(link);
  if (!seen.has(k)) seen.set(k, new Set());
  seen.get(k)!.add(folder);
};

/** Rows this login can see (through its own database rules) that carry one of these stored links. */
async function visibleLinks(me: Me, table: "meetings" | "event_money" | "complaints", forms: string[], seen: Seen, column = "file_url") {
  const extra = table === "complaints" ? "flat_id" : "event_id";
  for (let i = 0; i < forms.length; i += 30) {
    const { data, error } = await me.db.from(table).select(`${column}, ${extra}`).in(column, forms.slice(i, i + 30));
    if (error) continue;   // table not set up yet: nothing visible through it
    for (const r of (data as any[]) || []) addSeen(seen, r[column], rowFolder(table, r));
  }
}

/** Of these keys, the ones this login may open. */
export async function allowedKeys(me: Me, items: { key: string; folder: string }[]): Promise<Set<string>> {
  const ok = new Set<string>();
  const needRecord: { key: string; folder: string }[] = [];
  const memo = new Map<string, Promise<boolean>>();
  for (const it of items) {
    const a = folderAccess(it.folder, me);
    if (a === "yes") ok.add(it.key);
    else if (a === "team" && (await onEventTeam(me, it.folder.split("/")[1], memo))) ok.add(it.key);
    else if (a === "team" || a === "record") needRecord.push(it);
  }
  if (needRecord.length) {
    const bases = publicBases();
    const formsOf = (k: string) => storedForms(k, bases);
    const minutesForms = needRecord.flatMap((it) => formsOf(it.key));
    const eventForms = needRecord.filter((it) => it.folder.startsWith("eventdocs/")).flatMap((it) => formsOf(it.key));
    const seen: Seen = new Map();
    await visibleLinks(me, "meetings", minutesForms, seen);                 // signed minutes (final AGM / SGM, own event's minutes…)
    // committee meeting minutes listed to a committee member's own flat login (NOTICES → Committee meeting minutes):
    // that list comes from my_committee_meetings(), so its signed copies must open too
    if (needRecord.some((it) => it.folder === "minutes") && !me.isCommittee) {
      const { data, error } = await me.db.rpc("my_committee_meetings");
      if (!error) for (const m of (data as any[]) || []) addSeen(seen, m?.file_url, rowFolder("meetings", m || {}));
    }
    if (eventForms.length) await visibleLinks(me, "event_money", eventForms, seen);   // event bills, when shown to members
    const complaintForms = needRecord.filter((it) => it.folder.startsWith("complaints/")).flatMap((it) => formsOf(it.key));
    if (complaintForms.length) await visibleLinks(me, "complaints", complaintForms, seen, "photo_key");   // photo of a complaint assigned to this flat
    for (const it of needRecord) if (formsOf(it.key).some((f) => seen.get(f)?.has(it.folder))) ok.add(it.key);
  }
  return ok;
}

/**
 * Signed links for stored links (keys or old public addresses). Each answer is a link, or null when the file is
 * not one this login may open. Links to other websites come back unchanged.
 */
export async function linksFor(me: Me, refs: string[], seconds = SHOW_SECONDS): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const bases = publicBases();
  const parsed = refs.map((ref) => ({ ref, p: parseFileRef(ref, bases) }));
  const r2Items = parsed.flatMap(({ p }) => (p?.kind === "r2" ? [{ key: p.key, folder: p.folder }] : []));
  const ok = await allowedKeys(me, r2Items);
  for (const { ref, p } of parsed) {
    if (!p) out[ref] = null;
    else if (p.kind === "external") out[ref] = p.url;
    else out[ref] = ok.has(p.key) ? await signKey(p.key, seconds) : null;
  }
  return out;
}
