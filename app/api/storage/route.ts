// ADMIN → STORAGE USED (committee only): file storage (R2) by folder, and the database size.
// Only sizes and counts are returned, never file names.
import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getAuthedClient } from "@/lib/serverAuth";
import { getR2 } from "@/lib/r2Client";
import { callerSociety } from "@/lib/r2Access";
import { keyInSociety, keyPrefixOf, keyWithoutPrefix } from "@/lib/r2Keys";
import { FIRST_SOCIETY_ID } from "@/lib/memberships";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const me = await getAuthedClient(req);
  if (!me) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (!me.isCommittee) return NextResponse.json({ error: "Only the committee can see storage use." }, { status: 403 });
  const folders: Record<string, { bytes: number; files: number }> = {};
  let r2Error = "";
  const r2 = getR2();
  if (r2) {
    try {
      // Only this society's files are counted (the bucket is shared): the first society's keys have no prefix, the others' start with s/<id>/ (lib/r2Keys.ts).
      const society = await callerSociety(me);
      const prefixes: (string | undefined)[] = society === FIRST_SOCIETY_ID ? [undefined] : [keyPrefixOf(society), `backups/${society}/`];
      for (const Prefix of prefixes) {
        let token: string | undefined; let pages = 0;
        do {
          const res = await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix, ContinuationToken: token, MaxKeys: 1000 }));
          for (const o of res.Contents || []) {
            if (!o.Key || !keyInSociety(o.Key, society)) continue;
            const top = keyWithoutPrefix(o.Key).split("/")[0] || "(other)";
            const f = (folders[top] ||= { bytes: 0, files: 0 });
            f.bytes += o.Size || 0; f.files += 1;
          }
          token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token && ++pages < 50);
      }
    } catch (e: any) { r2Error = e?.message || "Could not read file storage"; }
  } else r2Error = "File storage is not set up";
  const { data, error } = await me.db.rpc("storage_stats");
  return NextResponse.json({ folders, r2Error, db: error ? null : data, dbError: error ? (/storage_stats/.test(error.message) ? "Run STORAGE_STATS.sql once in Supabase to see the database size." : error.message) : "" });
}
