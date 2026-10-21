"use client";
// Password box with a show / hide (eye) button. Hidden again automatically after 20 seconds.
import { useEffect, useState } from "react";

export default function PasswordInput({ value, onChange, autoComplete, required }: { value: string; onChange: (v: string) => void; autoComplete: string; required?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!show) return; const t = setTimeout(() => setShow(false), 20000); return () => clearTimeout(t); }, [show]);
  return (
    <div className="relative mt-1">
      <input type={show ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} required={required}
        value={value} onChange={(e) => onChange(e.target.value)} className="field mono !pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-9 grid place-items-center opacity-60 hover:opacity-100">
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.1M6.3 6.3C3.6 8.1 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}
