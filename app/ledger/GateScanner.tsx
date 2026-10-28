"use client";
// EVENTS → event → REGISTRATION → SCAN PASSES (event team, at the gate). Rules live in EVENT_CHECKINS.sql.
//   Scan a pass with the phone camera (or FIND FLAT when there is no QR), see the flat, the meal and how many of the
//   pass are already in, enter how many are coming in now, LET IN. The database refuses more than the pass is for.
import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { label, ownerText, sortFlats, type Flat } from "@/lib/society";
import { attended, gatePass, gateUndo, passCode, passReady, people, sessionsOf, sessionTotals, type Checkin, type GateResult, type Reg, type RegSettings } from "@/lib/eventReg";

type Ev = { id: string; title: string | null } & RegSettings;
type Shown = { code: string; busy: boolean; res: GateResult | null; err: string; done: string };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");

export default function GateScanner({ ev, regs, flats, checkins, onChanged, onClose }:
  { ev: Ev; regs: Reg[]; flats: Flat[]; checkins: Checkin[]; onChanged: () => void; onClose: () => void }) {
  const sessions = sessionsOf(ev);
  const [mode, setMode] = useState<"camera" | "find">("camera");
  const [shown, setShown] = useState<Shown | null>(null);
  const [n, setN] = useState(1);
  const [camErr, setCamErr] = useState("");
  const [findFlat, setFindFlat] = useState("");
  const [undoBusy, setUndoBusy] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paused = useRef(false);
  const last = useRef({ code: "", at: 0 });
  const tot = useMemo(() => sessionTotals(sessions, regs), [regs, ev.pass_sessions]);
  const att = useMemo(() => attended(checkins), [checkins]);
  const flatOf = (id: string) => flats.find((f) => f.id === id);
  const flatText = (id: string) => { const f = flatOf(id); return f ? label(f) : id; };

  // ---- camera ----
  useEffect(() => {
    if (mode !== "camera") return;
    let stream: MediaStream | null = null, stop = false, timer: any;
    const Detector = (window as any).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current!; v.srcObject = stream; await v.play().catch(() => {});
        setCamErr("");
        const tick = async () => {
          if (stop) return;
          if (!paused.current && v.readyState >= 2 && v.videoWidth) {
            let text = "";
            try {
              if (detector) { const found = await detector.detect(v); text = found?.[0]?.rawValue || ""; }
              else {
                const c = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
                const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w); c.width = w; c.height = h;
                const g = c.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D; g.drawImage(v, 0, 0, w, h);
                text = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data || "";
              }
            } catch { /* keep trying */ }
            const now = Date.now();
            if (text && !(text === last.current.code && now - last.current.at < 4000)) { last.current = { code: text, at: now }; look(text); }
          }
          timer = setTimeout(tick, 220);
        };
        tick();
      } catch (e: any) {
        setCamErr(/denied|permission|notallowed/i.test(String(e?.name || e?.message)) ? "The camera is blocked. Allow the camera for this site in the browser settings, or use FIND FLAT." : "The camera could not start on this phone. Use FIND FLAT.");
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [mode]);

  async function look(code: string) {
    paused.current = true;
    setShown({ code, busy: true, res: null, err: "", done: "" });
    try { const res = await gatePass(code); setShown({ code, busy: false, res, err: "", done: "" }); setN(Math.max(1, res.left)); }
    catch (e: any) { setShown({ code, busy: false, res: null, err: e.message || "Could not read this pass.", done: "" }); }
  }
  async function letIn() {
    if (!shown?.res) return;
    setShown({ ...shown, busy: true, err: "" });
    try {
      const res = await gatePass(shown.code, n);
      setShown({ ...shown, busy: false, res, err: "", done: `✓ ${n} let in • ${res.used} of ${res.allowed} now in` });
      if (navigator.vibrate) navigator.vibrate(120);
      onChanged();
    } catch (e: any) { setShown({ ...shown, busy: false, err: e.message || "Not saved. Try again." }); }
  }
  function next() { setShown(null); paused.current = false; last.current = { code: "", at: Date.now() }; }
  async function undo(k: Checkin) {
    if (!confirm(`Undo: ${k.people} let in for ${flatText(k.flat_id)} at ${time(k.created_at)}?`)) return;
    setUndoBusy(k.id);
    try { await gateUndo(k.id); onChanged(); } catch (e: any) { alert(e.message); }
    setUndoBusy("");
  }

  const r = shown?.res;
  const regsByFlat = [...regs].sort((a, b) => sortFlats(flatOf(a.flat_id) || ({ id: a.flat_id } as any), flatOf(b.flat_id) || ({ id: b.flat_id } as any)));
  const findReg = regs.find((x) => x.flat_id === findFlat) || null;

  return (
    <div className="fixed inset-0 z-[80] bg-[var(--bg)] overflow-y-auto">
      <div className="max-w-[520px] mx-auto p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><div className="mono text-[10px] tracking-[0.16em] opacity-70">GATE • SCAN PASSES</div><div className="serif text-[18px] font-bold truncate">{ev.title}</div></div>
          <button onClick={onClose} className="btn-line px-4 py-2.5 mono text-[12px] font-bold">✕ CLOSE</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tot.filter(({ t }) => people(t)).map(({ s, t }) => (
            <div key={s.id} className="border border-[var(--border)] bg-white p-2 mono text-[11px] min-w-0"><div className="truncate font-bold">{s.name}</div>
              <div><span className="serif text-[20px] font-bold">{att.bySession[s.id] || 0}</span> <span className="opacity-70">of {people(t)} in</span></div></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mono text-[12px] font-bold">
          {(["camera", "find"] as const).map((m) => <button key={m} onClick={() => { setMode(m); next(); }} className={`py-3 border ${mode === m ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>{m === "camera" ? "📷 CAMERA" : "🔎 FIND FLAT"}</button>)}
        </div>

        {mode === "camera" && <div className={`relative bg-black aspect-square overflow-hidden ${shown ? "hidden" : ""}`}>
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
          <div className="absolute inset-[18%] border-4 border-[var(--gold)] rounded-[6px] pointer-events-none" />
          {camErr ? <div className="absolute inset-x-0 bottom-0 bg-red-700 text-white p-3 text-[13px]">{camErr}</div>
            : <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white p-2 text-center mono text-[11px]">Hold the pass's QR code inside the square</div>}
        </div>}

        {mode === "find" && !shown && <div className="border border-[var(--border)] bg-white p-3 space-y-2">
          <label className="block mono text-[10px] tracking-[0.12em] opacity-80">FLAT (registered for this event)
            <select className="field mt-1" value={findFlat} onChange={(e) => setFindFlat(e.target.value)}>
              <option value="">Choose flat…</option>
              {regsByFlat.map((x) => { const f = flatOf(x.flat_id); return <option key={x.id} value={x.flat_id}>{flatText(x.flat_id)}{f ? ` • ${ownerText(f)}` : ""}{passReady(x) ? "" : " • NOT PAID"}</option>; })}
            </select></label>
          {findReg && <div className="grid gap-2">{sessions.filter((s) => people(findReg.counts?.[s.id])).map((s) => (
            <button key={s.id} onClick={() => look(passCode(findReg, s))} className="btn-navy py-3 text-[14px] font-bold">{s.name} • pass for {people(findReg.counts[s.id])}</button>
          ))}</div>}
        </div>}

        {shown && <div className={`border-2 p-4 space-y-3 ${shown.err || (r && (!r.paid || (r.left === 0 && !shown.done))) ? "border-red-600 bg-red-50" : shown.done ? "border-emerald-600 bg-emerald-50" : "border-[var(--navy)] bg-white"}`}>
          {shown.busy && !r && <div className="mono text-[13px]">Checking the pass…</div>}
          {r && <>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0"><div className="serif text-[30px] font-bold leading-none">{flatText(r.flat_id)}</div>
                <div className="text-[13px] opacity-80 truncate">{flatOf(r.flat_id) ? ownerText(flatOf(r.flat_id)!) : ""}</div></div>
              <div className="text-right mono text-[12px] font-bold shrink-0">{r.session}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mono">
              <div className="border border-[var(--border)] bg-white p-2"><div className="text-[9px] opacity-70">PASS FOR</div><div className="serif text-[22px] font-bold">{r.allowed}</div></div>
              <div className="border border-[var(--border)] bg-white p-2"><div className="text-[9px] opacity-70">ALREADY IN</div><div className="serif text-[22px] font-bold">{r.used}</div></div>
              <div className="border border-[var(--border)] bg-white p-2"><div className="text-[9px] opacity-70">LEFT</div><div className="serif text-[22px] font-bold">{r.left}</div></div>
            </div>
            {shown.done && <div className="text-emerald-800 font-bold text-[16px]">{shown.done}</div>}
            {!shown.done && !r.paid && <div className="text-red-700 font-bold text-[15px]">✗ Payment not confirmed. Ask the convenor or treasurer to confirm it first.</div>}
            {!shown.done && r.paid && r.left === 0 && <div className="text-red-700 font-bold text-[15px]">✗ PASS FULL: all {r.allowed} already in{r.last_at ? ` (last at ${time(r.last_at)})` : ""}.</div>}
            {!shown.done && r.paid && r.left > 0 && <>
              <div className="mono text-[10px] tracking-[0.12em] opacity-80">HOW MANY ARE COMING IN NOW?</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setN(Math.max(1, n - 1))} disabled={n <= 1 || shown.busy} className="btn-line w-14 h-14 text-[24px] font-bold">−</button>
                <div className="flex-1 text-center serif text-[34px] font-bold">{n}</div>
                <button onClick={() => setN(Math.min(r.left, n + 1))} disabled={n >= r.left || shown.busy} className="btn-line w-14 h-14 text-[24px] font-bold">+</button>
              </div>
              <button onClick={letIn} disabled={shown.busy} className="w-full bg-emerald-700 text-white py-4 text-[18px] font-bold">{shown.busy ? "SAVING…" : `✓ LET IN ${n}`}</button>
            </>}
          </>}
          {shown.err && <div className="text-red-700 font-bold text-[15px]">✗ {shown.err}</div>}
          <button onClick={next} className="w-full btn-navy py-3.5 text-[15px] font-bold">{mode === "camera" ? "📷 SCAN NEXT" : "NEXT FLAT"}</button>
        </div>}

        {checkins.length > 0 && <div className="border border-[var(--border)] bg-white">
          <div className="mono text-[10px] tracking-[0.14em] font-bold px-3 py-2 border-b border-[var(--border)]">LAST ENTRIES</div>
          {checkins.slice(0, 8).map((k) => (
            <div key={k.id} className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] last:border-0 text-[13px]">
              <b className="w-[58px]">{flatText(k.flat_id)}</b>
              <span className="flex-1 min-w-0 truncate opacity-80">{k.people} in • {sessions.find((s) => s.id === k.session_id)?.name || ""} • {time(k.created_at)}</span>
              <button onClick={() => undo(k)} disabled={undoBusy === k.id} className="underline text-red-700 text-[12px] px-1 py-2">{undoBusy === k.id ? "…" : "undo"}</button>
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}
