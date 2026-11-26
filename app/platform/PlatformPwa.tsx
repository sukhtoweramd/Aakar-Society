"use client";
// Registers the platform app's own service worker (scope /platform) and shows an install button when the browser allows it.
// The society app's worker (/sw.js) is not touched.
import { useEffect } from "react";
import { InstallApp } from "@/app/ledger/PwaRegister";

export default function PlatformPwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/platform-sw.js", { scope: "/platform" }).catch(() => {});
    }
  }, []);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-3 pointer-events-none">
      <div className="mx-auto max-w-[420px] pointer-events-auto"><InstallApp variant="card" label="AanganOne Platform" /></div>
    </div>
  );
}
