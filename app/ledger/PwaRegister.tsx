"use client";
import { useEffect, useState } from "react";

// Keeps the browser's "install" event so our own INSTALL APP button can use it later.
let deferred: any = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => { e.preventDefault(); deferred = e; notify(); };
    const onInstalled = () => { deferred = null; notify(); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** INSTALL APP button (Android / desktop Chrome & Edge) or an "Add to Home Screen" tip on iPhone. */
export function InstallApp({ variant }: { variant: "bar" | "card" }) {
  const [, force] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!mounted || isStandalone()) return null;

  if (deferred) {
    const install = async () => { deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; notify(); };
    return variant === "bar"
      ? <button onClick={install} className="border px-3 py-1.5 text-[11px] tracking-[0.06em] font-semibold rounded-[3px] bg-white/10 text-white border-white/20">⬇ INSTALL APP</button>
      : <button type="button" onClick={install} className="btn-line w-full mono text-[11px] tracking-[0.12em] py-2.5">⬇ INSTALL AAKAR CO-OP APP</button>;
  }

  if (isIos() && variant === "card") {
    return (
      <div className="mono text-[11px] border border-[var(--border)] bg-[var(--bg)] p-3 rounded-[2px]">
        <button type="button" onClick={() => setShowTip((v) => !v)} className="w-full text-left font-semibold tracking-[0.06em]">📱 INSTALL ON IPHONE {showTip ? "▲" : "▼"}</button>
        {showTip && (
          <ol className="mt-2 list-decimal pl-4 opacity-80 space-y-0.5">
            <li>Open this page in <b>Safari</b></li>
            <li>Tap the <b>Share</b> button (square with ↑ arrow)</li>
            <li>Choose <b>Add to Home Screen</b> → <b>Add</b></li>
          </ol>
        )}
      </div>
    );
  }
  return null;
}
