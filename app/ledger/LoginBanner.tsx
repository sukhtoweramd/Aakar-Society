"use client";
// Large banner shown right after login for notices the committee marked "Show as login banner".
// Several banners slide like an OTT home screen. X closes it for this visit only.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Notice } from "@/lib/society";
import { birthdaysToday, type Birthday } from "@/lib/birthdays";
import { FileLink, SecureImg } from "./SecureFile";

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
  const [reading, setReading] = useState<Banner | null>(null); // full notice view
  const [bdays, setBdays] = useState<Birthday[]>([]); // members with a birthday today: one slide for all of them
  const offset = bdays.length ? 1 : 0;
  const total = items.length + offset;

  useEffect(() => {
    try { if (sessionStorage.getItem(KEY(userId))) return; } catch {}
    const now = new Date();
    supabase.from("member_directory").select("flat_id,tower,member_name,birth_day,birth_month")
      .eq("birth_month", now.getMonth() + 1) // this month only; the exact day (and 29 Feb) is decided in lib/birthdays.ts
      .then(({ data, error }) => { // directory not updated yet (DOB.sql) or nobody today: no birthday slide
        if (error || !data) return;
        const list = birthdaysToday(data as never[], now);
        if (list.length) { setBdays(list); setOpen(true); }
      });
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
    if (!open || total < 2) return;
    started.current = Date.now(); setProgress(0);
    const t = setInterval(() => {
      if (paused || reading) { started.current = Date.now() - progress * SLIDE_MS; return; }
      const p = (Date.now() - started.current) / SLIDE_MS;
      if (p >= 1) { setI((x) => (x + 1) % total); started.current = Date.now(); setProgress(0); } else setProgress(p);
    }, 80);
    return () => clearInterval(t);
  }, [open, total, i, paused, reading]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (reading) setReading(null); else close(); return; } if (reading) return; if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, total, reading]);

  function close() { try { sessionStorage.setItem(KEY(userId), "1"); } catch {} setOpen(false); }
  function go(d: number) { setI((x) => (x + d + total) % total); }
  if (!open || !total) return null;
  const onBirthday = offset === 1 && i === 0;
  const b = items[Math.max(0, Math.min(i - offset, items.length - 1))] as Banner;
  const img = !onBirthday && isImage(b?.file_url) ? b.file_url! : null;
  const towerLabel = !b?.tower || /common|all/i.test(b.tower) ? "ALL TOWERS" : `TOWER ${b.tower.replace(/tower\s*/i, "").toUpperCase()}`;

  if (reading) {
    const rimg = isImage(reading.file_url) ? reading.file_url! : null;
    return (
      <div className="fixed inset-0 z-[100] bg-[rgba(8,14,32,0.85)] overflow-y-auto p-3 sm:p-6 fade-in" role="dialog" aria-modal="true" aria-label={reading.title || "Notice"} onClick={() => setReading(null)}>
        <div onClick={(e) => e.stopPropagation()} className="mx-auto max-w-[760px] bg-[var(--surface)] text-[var(--ink)] border-[3px] border-[var(--gold)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          <div className="sticky top-0 z-10 bg-[var(--navy)] text-white flex items-center justify-between gap-2 px-4 py-2.5">
            <button onClick={() => setReading(null)} className="mono text-[12px] font-bold tracking-[0.08em] hover:text-[var(--gold)]">← {items.length > 1 ? "ALL BANNERS" : "BACK"}</button>
            <button onClick={() => { setReading(null); close(); }} aria-label="Close" className="h-9 w-9 grid place-items-center text-[20px] hover:bg-white/10">✕</button>
          </div>
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 mono text-[10px] tracking-[0.16em]">
              <span className="bg-[var(--gold)] text-black px-2 py-0.5 font-bold">NOTICE</span>
              <span className="border border-[var(--border)] px-2 py-0.5">{!reading.tower || /common|all/i.test(reading.tower) ? "ALL TOWERS" : `TOWER ${reading.tower.replace(/tower\s*/i, "").toUpperCase()}`}</span>
              <span className="opacity-60">{new Date(reading.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span>
            </div>
            <h2 className="serif text-[28px] sm:text-[34px] font-bold leading-tight mt-3">{reading.title}</h2>
            {reading.content && <div className="text-[15px] leading-relaxed mt-3 whitespace-pre-wrap">{reading.content}</div>}
            {rimg && <FileLink file={rimg} title="Open full size"><SecureImg src={rimg} alt={reading.title || ""} className="mt-5 w-full h-auto border border-[var(--border)]" /></FileLink>}
            {reading.file_url && !rimg && <FileLink file={reading.file_url} className="inline-block mt-5 btn-navy mono text-[12px] px-4 py-2.5">📎 OPEN ATTACHMENT</FileLink>}
            <div className="mt-6 pt-4 border-t border-[var(--border)] flex flex-wrap justify-between gap-3 mono text-[11px]">
              <button onClick={() => { setReading(null); close(); onRead(); }} className="underline">See all society notices</button>
              {rimg && <FileLink file={rimg} className="underline">Open picture full size ↗</FileLink>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(8,14,32,0.72)] backdrop-blur-[2px] grid place-items-center p-4 fade-in" onClick={close} role="dialog" aria-modal="true" aria-label="Society notices">
      <div onClick={(e) => e.stopPropagation()} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}
        className="relative w-full max-w-[560px] sm:aspect-square max-h-[92vh] bg-[var(--navy)] text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)] border-[3px] border-[var(--gold)] flex flex-col overflow-hidden">
        {/* progress bars, one per banner */}
        {total > 1 && (
          <div className="absolute top-3 left-4 right-14 z-10 flex gap-1.5">
            {Array.from({ length: total }).map((_, k) => (
              <button key={k} onClick={() => { setI(k); }} aria-label={`Banner ${k + 1}`} className="flex-1 h-[4px] bg-white/25 overflow-hidden">
                <div className="h-full bg-[var(--gold)]" style={{ width: k < i ? "100%" : k === i ? `${Math.round(progress * 100)}%` : "0%" }} />
              </button>
            ))}
          </div>
        )}
        <button onClick={close} aria-label="Close" className="absolute top-2 right-2 z-10 h-10 w-10 grid place-items-center text-[22px] leading-none bg-black/30 hover:bg-black/50">✕</button>

        {onBirthday ? (
          <div className="flex-1 overflow-y-auto relative">
            <div className="absolute -right-10 top-4 h-52 w-52 rounded-full border-[16px] border-[var(--gold)] opacity-15 pointer-events-none" />
            <div className="relative px-6 pt-16 pb-3">
              <div className="flex flex-wrap items-center gap-2 mono text-[10px] tracking-[0.16em]">
                <span className="bg-[var(--gold)] text-black px-2 py-0.5 font-bold">{bdays.length > 1 ? "BIRTHDAYS" : "BIRTHDAY"}</span>
                <span className="opacity-70">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}</span>
              </div>
              <div className="serif text-[30px] font-bold leading-tight mt-3">Happy Birthday!</div>
              <div className="text-[14px] opacity-85 mt-1">{bdays.length > 1 ? `${bdays.length} members celebrate today.` : "Wishing our Aakar family member a wonderful year ahead."}</div>
              <div className="mt-4 grid gap-2">
                {bdays.map((x, k) => (
                  <div key={k} className="min-w-0 bg-white/[0.07] border border-white/20 px-3.5 py-3">
                    <div className="serif text-[19px] font-bold leading-tight break-words">{x.name}</div>
                    <div className="mono text-[11px] tracking-[0.08em] opacity-70 mt-0.5">{[x.tower && `TOWER ${x.tower}`, x.flat && `FLAT ${x.flat}`].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : img ? (
          <div className="relative flex-1 min-h-[300px] sm:min-h-[220px] bg-black">
            <SecureImg src={img} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50" />
            <SecureImg src={img} alt="" className="absolute inset-0 w-full h-full object-contain cursor-zoom-in" onClick={() => setReading(b)} />
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--navy)] to-transparent pointer-events-none" />
          </div>
        ) : (
          <div className="flex-1 min-h-[120px] relative overflow-hidden">
            <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full border-[18px] border-[var(--gold)] opacity-15" />
            <div className="absolute left-6 bottom-2 serif text-[90px] leading-none text-[var(--gold)] opacity-25">ॐ</div>
          </div>
        )}

        {onBirthday ? (
          <div className="px-6 pb-5 pt-2 flex items-center justify-between gap-3">
            <button onClick={close} className="bg-[var(--gold)] text-black mono text-[12px] font-bold tracking-[0.1em] px-5 min-h-[44px]">CONTINUE →</button>
            <div className="flex items-center gap-2 mono text-[12px]">
              <button onClick={() => go(-1)} aria-label="Previous" className="h-11 w-11 border border-white/30 hover:border-[var(--gold)]">‹</button>
              <span className="opacity-70 w-10 text-center">{i + 1} / {total}</span>
              <button onClick={() => go(1)} aria-label="Next" className="h-11 w-11 border border-white/30 hover:border-[var(--gold)]">›</button>
            </div>
          </div>
        ) : (
        <div className="px-6 pb-5 pt-3">
          <div className="flex flex-wrap items-center gap-2 mono text-[10px] tracking-[0.16em]">
            <span className="bg-[var(--gold)] text-black px-2 py-0.5 font-bold">NOTICE</span>
            <span className="border border-white/30 px-2 py-0.5">{towerLabel}</span>
            <span className="opacity-60">{new Date(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          <div className="serif text-[26px] sm:text-[30px] font-bold leading-tight mt-3">{b.title}</div>
          {b.content && <div className="text-[14px] leading-relaxed opacity-85 mt-2 line-clamp-4 whitespace-pre-line">{b.content}</div>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button onClick={() => setReading(b)} className="bg-[var(--gold)] text-black mono text-[12px] font-bold tracking-[0.1em] px-5 py-2.5">READ NOTICE →</button>
            {total > 1 && (
              <div className="flex items-center gap-2 mono text-[12px]">
                <button onClick={() => go(-1)} aria-label="Previous" className="h-9 w-9 border border-white/30 hover:border-[var(--gold)]">‹</button>
                <span className="opacity-70 w-10 text-center">{i + 1} / {total}</span>
                <button onClick={() => go(1)} aria-label="Next" className="h-9 w-9 border border-white/30 hover:border-[var(--gold)]">›</button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
