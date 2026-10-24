// Which R2 files exist, and who may open them. Plain logic only (no keys, no network), shared by the
// file routes and the tests. The actual checks run on the server (lib/r2Access.ts).
//
// Folders:
//   notices/              notice attachments and login-banner pictures      → every login
//   vault/                society documents (VAULT tab)                      → every login
//   floor-plans/<A|B|C>/  floor plans                                        → every login
//   events/<event id>/    event photos                                       → every login
//   flats/<flat>/         that flat's documents                              → committee + that flat
//   amc/                  AMC contract copies                                → committee only
//   minutes/              signed minutes of AGM / SGM / committee meetings   → committee, or a member who can see
//                                                                              the meeting it is attached to
//   eventdocs/<event id>/ event minutes, bills, receipts                     → committee, that event's team, or a
//                                                                              member who can see the entry it is attached to
// Not served by these routes: payproofs/ (own route /api/payment-proof) and backups/ (main admin only).

export function safeFolder(raw: string): string | null {
  const f = String(raw || "").replace(/^\/+|\/+$/g, "");
  if (f === "notices" || f === "vault" || f === "amc" || f === "minutes") return f;
  if (/^flats\/[A-Z]\d{1,5}$/.test(f)) return f;
  if (/^events\/[0-9a-f-]{36}$/.test(f)) return f;
  if (/^eventdocs\/[0-9a-f-]{36}$/.test(f)) return f;
  if (/^floor-plans\/[A-Z]$/.test(f)) return f;
  return null;
}

/** "notices/1729_x.jpg" → "notices"; null for anything outside the folders above or with an odd name. */
export function folderOfKey(key: string): string | null {
  const k = String(key || "");
  const cut = k.lastIndexOf("/");
  if (cut <= 0) return null;
  const name = k.slice(cut + 1);
  if (!name || name === "." || name === ".." || /[\\\u0000-\u001f]/.test(name)) return null;
  return safeFolder(k.slice(0, cut));
}

export type FileRef = { kind: "r2"; key: string; folder: string } | { kind: "external"; url: string };

/**
 * What a stored link points to. Old rows keep the full public address (https://<public R2 address>/notices/…),
 * newer ones may hold just the key (notices/…). Both become the R2 key, so old links keep working after the
 * bucket stops being public. A link to some other website is returned as "external" and opened as it is.
 * publicBases: the R2 public addresses this app has used (from R2_PUBLIC_URL / CLOUDFLARE_R2_PUBLIC_URL).
 */
export function parseFileRef(ref: string, publicBases: string[]): FileRef | null {
  const r = String(ref || "").trim();
  if (!r || r.length > 1000) return null;
  let key: string | null = null;
  if (/^https?:\/\//i.test(r)) {
    let u: URL;
    try { u = new URL(r); } catch { return null; }
    const base = publicBases.map((b) => b.replace(/\/+$/, "")).find((b) => b && r.startsWith(`${b}/`));
    if (base) key = r.slice(base.length + 1).split(/[?#]/)[0];
    else if (/\.r2\.dev$/i.test(u.hostname)) key = u.pathname.replace(/^\/+/, "");   // an older public R2 address
    else return { kind: "external", url: r };
    try { key = decodeURIComponent(key); } catch { return null; }
  } else if (/^[a-z]+:/i.test(r) || r.startsWith("/")) {
    return null;                                                                    // data:, blob:, /api/… — not a stored file
  } else {
    key = r;
  }
  const folder = folderOfKey(key);
  return folder ? { kind: "r2", key, folder } : null;
}

export type Who = { isCommittee: boolean; flatId: string | null };
/**
 * yes   → may open every file in the folder
 * no    → may not
 * team  → only if this flat is on that event's organising team; otherwise as "record"
 * record→ only if this login can see (through the database rules) the meeting / event entry the file is attached to
 */
export type FolderAccess = "yes" | "no" | "team" | "record";
export function folderAccess(folder: string, who: Who): FolderAccess {
  if (who.isCommittee) return "yes";
  if (folder === "notices" || folder === "vault" || folder.startsWith("floor-plans/") || folder.startsWith("events/")) return "yes";
  if (folder.startsWith("flats/")) return !!who.flatId && folder === `flats/${who.flatId}` ? "yes" : "no";
  if (folder === "minutes") return "record";
  if (folder.startsWith("eventdocs/")) return "team";
  return "no";   // amc and anything new: committee only until a rule is added here
}

/** The forms a key may be stored in a row: the bare key or the full public address. */
export function storedForms(key: string, publicBases: string[]): string[] {
  return Array.from(new Set([key, ...publicBases.filter(Boolean).map((b) => `${b.replace(/\/+$/, "")}/${key}`)]));
}
