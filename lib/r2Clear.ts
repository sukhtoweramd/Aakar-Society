// Delete every file under some R2 folders (used once, by CLEAR TEST DOCUMENTS before GO LIVE). Server only.
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2 } from "./r2Client";
import { TEST_FILE_FOLDERS } from "./testClear";
import { keyPrefixOf } from "./r2Keys";

// Only ONE society's files: the first society's folders are the plain ones, the others' are under s/<society id>/ (lib/r2Keys.ts).
export async function deleteTestFiles(society: string): Promise<{ deleted: number; failed: number } | null> {
  const r2 = getR2();
  if (!r2) return null;
  let deleted = 0, failed = 0;
  for (const folder of TEST_FILE_FOLDERS) {
    const prefix = keyPrefixOf(society) + folder;
    let token: string | undefined;
    do {
      const res = await r2.client.send(new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
      const keys = (res.Contents || []).map((o) => o.Key).filter((k): k is string => !!k && k.startsWith(prefix));
      if (keys.length) {
        const out = await r2.client.send(new DeleteObjectsCommand({ Bucket: r2.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
        failed += out.Errors?.length || 0;
        deleted += keys.length - (out.Errors?.length || 0);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }
  return { deleted, failed };
}
