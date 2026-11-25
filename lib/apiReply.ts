// Words for a reply from our own API that the screen could not read as JSON (used by lib/ledgerClient.ts `api()`).
// Pure on purpose, so it can be tested without the Supabase client.
// Nov 2026: live backup showed a bare "Server error 200" twice (the backup itself was saved). The extra words say WHY
// (cut off on the way / empty / not JSON) and carry the Vercel request ref, so the exact request can be found in the logs.
export type BadReply = {
  status: number;
  readError?: string;        // the body could not be read to the end (network cut)
  body?: string;             // what was read
  contentType?: string | null;
  ref?: string | null;       // x-vercel-id
};

export function badReplyMessage(i: BadReply): string {
  const bits: string[] = [];
  if (i.readError) bits.push(`the reply was cut off on the way: ${i.readError}`);
  else if (!i.body || !i.body.trim()) bits.push("the reply was empty");
  else bits.push(`the reply was not JSON: ${i.body.trim().replace(/\s+/g, " ").slice(0, 80)}`);
  if (i.contentType) bits.push(i.contentType.split(";")[0].trim());
  if (i.ref) bits.push(`ref ${i.ref}`);
  return `Server error ${i.status} (${bits.join("; ")})`;
}
