"use client";
// Opening stored files (notices, vault, flat documents, minutes, AMC, event papers and photos, floor plans).
// Rows keep their stored link (old public address or key); before showing it, the screen asks /api/file/link
// for a short-lived signed link, with the login. Requests made together are sent as one.
import { useEffect, useState } from "react";
import { api } from "./ledgerClient";

/** Links that need no signing: pictures made in the browser, and links that are already signed. */
const usableAsIs = (ref: string) => /^(data|blob):/i.test(ref) || /[?&]X-Amz-Signature=/.test(ref);

type Waiter = { resolve: (v: string | null) => void; reject: (e: any) => void };
const cache = new Map<string, { url: string | null; until: number }>();
let queue = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = queue; queue = new Map();
  const refs = Array.from(batch.keys());
  for (let i = 0; i < refs.length; i += 100) {
    const part = refs.slice(i, i + 100);
    try {
      const j = await api("/api/file/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs: part, purpose: "show" }) });
      const until = Date.now() + Math.max(30, (Number(j.seconds) || 600) - 120) * 1000;   // renew 2 minutes before it expires
      for (const r of part) {
        const url = (j.links || {})[r] ?? null;
        cache.set(r, { url, until });
        batch.get(r)!.forEach((w) => w.resolve(url));
      }
    } catch (e) {
      for (const r of part) batch.get(r)!.forEach((w) => w.reject(e));
    }
  }
}

/** A signed link for showing a stored file on the page (about 10 minutes), or null if this login may not see it. */
export function fileLink(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return Promise.resolve(null);
  if (usableAsIs(ref)) return Promise.resolve(ref);
  const c = cache.get(ref);
  if (c && c.until > Date.now()) return Promise.resolve(c.url);
  return new Promise((resolve, reject) => {
    const list = queue.get(ref) || [];
    list.push({ resolve, reject }); queue.set(ref, list);
    if (!timer) timer = setTimeout(flush, 15);
  });
}

/** Signed link for a stored file, for pictures (<img>) and print pages. null while loading or when not allowed. */
export function useFileLink(ref: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(ref && usableAsIs(ref) ? ref : null);
  useEffect(() => {
    let live = true;
    setUrl(ref && usableAsIs(ref) ? ref : null);
    fileLink(ref).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [ref]);
  return url;
}

/** Opens a stored file in a new tab with a fresh 2-minute link (the tab is opened first so pop-up blockers allow it). */
export async function openFile(ref: string | null | undefined) {
  if (!ref) return;
  if (usableAsIs(ref)) { window.open(ref, "_blank", "noopener"); return; }
  const w = window.open("", "_blank");
  try {
    if (w) w.document.write('<p style="font-family:Arial;padding:24px">Opening the file…</p>');
    const j = await api("/api/file/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refs: [ref], purpose: "open" }) });
    const url = (j.links || {})[ref];
    if (!url) throw new Error("This file is not available to your login, or it has been removed.");
    if (w) { w.opener = null; w.location.href = url; } else window.open(url, "_blank", "noopener");
  } catch (e: any) { w?.close(); alert(e.message || "Could not open the file."); }
}
