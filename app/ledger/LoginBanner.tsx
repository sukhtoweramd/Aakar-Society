"use client";
// Large banner shown right after login for notices the committee marked "Show as login banner".
// Several banners slide like an OTT home screen. X closes it for this visit only.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Notice } from "@/lib/society";

type Banner = Notice & { is_banner?: boolean; banner_until?: string | null };
const SLIDE_MS = 6000;
const isImage = (url?: string | null) => !!url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
const KEY = (uid: string) => `aakar_banner_closed_${uid}`;
export const clearBannerDismissal = (uid?: string) => { try { if (uid) sessionStorage.removeItem(KEY(uid)); } catch {} };

export default function LoginBanner({ userId, tower, isCommittee, onRead }: { userId: string; tower: string | null; isCommittee: boolean; onRead: () => void }) {
  const [items, setItems] = useState<Banner[]>([]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const started = useRef(Date.now());
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    try { if (sessionStorage.getItem(KEY(userId))) return; } catch {}
    supabase.from("notices").select("*").eq("is_banner", true).order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error || !data) return; // column not added yet, or no banners
      const today = new Date().toISOString().slice(0, 10);
      const list = (data as Banner[]).filter((n) =>
        (!n.banner_until || n.banner_until >= today) &&
        (isCommittee || !n.tower || /common|all/i.test(n.tower) || n.tower.replace(/tower\s*/i, "").toUpperCase() === tower));
      setItems(list);
      if (list.length) setOpen(true);
    });
  }, [userId]);

  // timer: next slide every SLIDE_MS unless paused
  useEffect(() => {
    if (!open || items.length < 2) return;
    started.current = Date.now(); setProgress(0);
    const t = setInterval(() => {
      if (paused) { started.current = Date.now() - progress * SLIDE_MS; return; }
      const p = (Date.now() - started.current) / SLIDE_MS;
      if (p >= 1) { setI((x) => (x + 1) % items.length); started.current = Date.now(); setProgress(0); } else setProgress(p);
    }, 80);
    return () => clearInterval(t);
  }, [open, items.length, i, paused]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, items.length]);

  function close() { try { sessionStorage.setItem(KEY(userId), "1"); } catch {} setOpen(false); }
  function go(d: number) { setI((x) => (x + d + items.length) % items.length); }
  if (!open || !items.length) return null;
  const b = items[Math.min(i, items.length - 1)];
  const img = isImage(b.file_url) ? b.file_url! : null;
  const towerLabel = !b.tower || /common|all/i.test(b.tower) ? "ALL TOWERS" : `TOWER ${b.tower.replace(/tower\s*/i, "").toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(8,14,32,0.72)] backdrop-blur-[2px] grid place-items-center p-4 fade-in" onClick={close} role="dialog" aria-modal="true" aria-label="Society notices">
      <div onClick={(e) => e.stopPropagation()} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}
        className="relative w-full max-w-[560px] sm:aspect-square max-h-[92vh] bg-[var(--navy)] text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)] border-[3px] border-[var(--gold)] flex flex-col overflow-hidden">
        {/* progress bars, one per banner */}
        {items.length > 1 && (
          <div className="absolute top-3 left-4 right-14 z-10 flex gap-1.5">
            {items.map((_, k) => (
              <button key={k} onClick={() => { setI(k); }} aria-label={`Banner ${k + 1}`} className="flex-1 h-[4px] bg-white/25 overflow-hidden">
                <div className="h-full bg-[var(--gold)]" style={{ width: k < i ? "100%" : k === i ? `${Math.round(progress * 100)}%` : "0%" }} />
              </button>
            ))}
          </div>
        )}
        <button onClick={close} aria-label="Close" className="absolute top-2 right-2 z-10 h-10 w-10 grid place-items-center text-[22px] leading-none bg-black/30 hover:bg-black/50">✕</button>

        {img ? (
          <div className="relative flex-1 min-h-[220px] bg-black">
            <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy)] via-transparent to-transparent" />
          </div>
        ) : (
          <div className="flex-1 min-h-[120px] relative overflow-hidden">
            <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full border-[18px] border-[var(--gold)] opacity-15" />
            <div className="absolute left-6 bottom-2 serif text-[90px] leading-none text-[var(--gold)] opacity-25">ॐ</div>
          </div>
        )}

        <div className="px-6 pb-5 pt-3">
          <div className="flex flex-wrap items-center gap-2 mono text-[10px] tracking-[0.16em]">
            <span className="bg-[var(--gold)] text-black px-2 py-0.5 font-bold">NOTICE</span>
            <span className="border border-white/30 px-2 py-0.5">{towerLabel}</span>
            <span className="opacity-60">{new Date(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          <div className="serif text-[26px] sm:text-[30px] font-bold leading-tight mt-3">{b.title}</div>
          {b.content && <div className="text-[14px] leading-relaxed opacity-85 mt-2 line-clamp-4 whitespace-pre-line">{b.content}</div>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button onClick={() => { close(); onRead(); }} className="bg-[var(--gold)] text-black mono text-[12px] font-bold tracking-[0.1em] px-5 py-2.5">READ NOTICE →</button>
            {items.length > 1 && (
              <div className="flex items-center gap-2 mono text-[12px]">
                <button onClick={() => go(-1)} aria-label="Previous" className="h-9 w-9 border border-white/30 hover:border-[var(--gold)]">‹</button>
                <span className="opacity-70 w-10 text-center">{i + 1} / {items.length}</span>
                <button onClick={() => go(1)} aria-label="Next" className="h-9 w-9 border border-white/30 hover:border-[var(--gold)]">›</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
