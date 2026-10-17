"use client";
// Permanent delete of a bill / receipt / letter — main admin only (checked again on the server).
import { useEffect, useState } from "react";
import { api } from "./ledgerClient";

let cached: Promise<boolean> | null = null;
export function useMainAdmin(enabled = true) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    cached = cached || api("/api/docs").then((j) => !!j.isMainAdmin).catch(() => { cached = null; return false; });
    let live = true; cached.then((v) => live && setOk(v));
    return () => { live = false; };
  }, [enabled]);
  return ok;
}

/** Asks for the word DELETE, then deletes. Returns true when deleted. Throws on server errors. */
export async function deleteDoc(kind: "bill" | "receipt" | "letter", id: string, number: string, extra = "") {
  const word = kind === "bill" ? "bill" : kind === "receipt" ? "receipt" : "letter";
  const typed = prompt(`DELETE ${word} ${number} permanently?${extra ? "\n" + extra : ""}\n\nIt is removed completely (not kept as cancelled) and cannot be undone. Use this for test entries and mistakes; for real documents use cancel.\n\nType DELETE to confirm:`);
  if (typed?.trim().toUpperCase() !== "DELETE") return false;
  const r = await api("/api/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", kind, id }) });
  alert(`${word[0].toUpperCase() + word.slice(1)} ${r.number} deleted.${r.reused ? ` It was the last number issued, so ${r.number} will be used again for the next ${word}.` : ""}`);
  return true;
}
