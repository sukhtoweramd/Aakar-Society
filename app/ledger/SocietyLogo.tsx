"use client";
// The society's logo for screens (27 Nov 2026): its own picture, else the first society's Om sign, else the first letter of the name.
// The box (size, border, colours) is the caller's className; a picture fills it.
import { currentMark, type Mark } from "@/lib/societyLogo";

export default function SocietyLogo({ className, mark }: { className: string; mark?: Mark }) {
  const m = mark || currentMark();
  return (
    <div className={`${className} overflow-hidden`} aria-hidden="true">
      {m.kind === "image" ? <img src={m.src} alt="" className="h-full w-full object-contain" /> : m.text}
    </div>
  );
}
