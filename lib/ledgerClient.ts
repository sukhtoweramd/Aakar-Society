"use client";
import { supabase } from "./supabaseClient";
import type { StoredFile } from "./society";
import { badReplyMessage } from "./apiReply";

/** Call our own API routes with the logged-in user's token. */
export async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${data.session?.access_token || ""}` } });
  let body = "", readError = "", j: any = null, parsed = false;
  try { body = await res.text(); } catch (e: any) { readError = `${e?.name || "Error"} ${e?.message || ""}`.trim(); }
  if (!readError) { try { j = JSON.parse(body); parsed = true; } catch { /* not JSON */ } }
  if (!parsed || j === null) {
    const msg = badReplyMessage({ status: res.status, readError, body, contentType: res.headers.get("content-type"), ref: res.headers.get("x-vercel-id") });
    console.warn("[api]", path, msg);
    throw new Error(msg);
  }
  if (!res.ok || j.error) throw new Error(j.error || `Server error ${res.status}`);
  return j;
}

export async function uploadFile(file: File, folder: string, slot?: string): Promise<{ url: string; key: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  if (slot) fd.append("slot", slot);
  return api("/api/file", { method: "POST", body: fd });
}

export async function listFiles(folder: string): Promise<StoredFile[]> {
  return (await api(`/api/file?folder=${encodeURIComponent(folder)}`)).files || [];
}

export async function deleteFile(target: { url?: string | null; key?: string }) {
  return api("/api/file", { method: "DELETE", body: JSON.stringify(target), headers: { "Content-Type": "application/json" } });
}

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
export const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
