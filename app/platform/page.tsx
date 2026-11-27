"use client";
// Product owner page: sign in, see every society as counts only, create a society, reset an owner's password.
// The server (/api/platform) decides who may do this; this screen only shows what the server returns.
// Phone first: cards, 44 px buttons, no wide tables.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { newSocietyProblems, platformTotals, suggestWord } from "@/lib/platformOwner";

type Item = { id: string; slug: string; name: string; status: string; created_at: string; owner_email: string | null; flats: number; logins: { committee: number; flat: number; tenant: number } };
type Secret = { email: string; password: string; word?: string; society?: string };

async function call(method: "GET" | "POST", body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || "";
  const r = await fetch("/api/platform", { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

const niceDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso.slice(0, 10); } };

function Stat({ n, label }: { n: number | string; label: string }) {
  return <div className="border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-center min-w-0"><div className="serif text-[20px] leading-none">{n}</div><div className="mono text-[9px] tracking-normal uppercase opacity-60 mt-1">{label}</div></div>;
}

export default function PlatformPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [who, setWho] = useState("");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [copied, setCopied] = useState("");
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState(""); const [word, setWord] = useState(""); const [wordEdited, setWordEdited] = useState(false); const [owner, setOwner] = useState("");
  const [origin, setOrigin] = useState("");
  const secretRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await call("GET");
    setLoading(false);
    if (r.ok) { setItems(r.j.societies); setMsg(""); }
    else { setItems(null); setMsg(r.status === 403 ? "This login is not the product owner." : r.j.error || "Could not load."); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSignedIn(!!data.session); setWho(data.session?.user.email || ""); if (data.session) load(); });
  }, [load]);

  // a new first password is shown at the top: bring it into view (the buttons that make it are further down the page)
  useEffect(() => { if (secret) { setCopied(""); secretRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } }, [secret]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) { setMsg("Wrong email or password."); return; }
    setPass(""); setSignedIn(true); setWho(email.trim()); load();
  }
  async function signOut() { await supabase.auth.signOut(); setSignedIn(false); setItems(null); setSecret(null); setWho(""); setMsg(""); }

  const problems = useMemo(() => newSocietyProblems({ name, word, ownerEmail: owner }, (items || []).map((s) => s.slug)), [name, word, owner, items]);

  function onName(v: string) { setName(v); if (!wordEdited) setWord(suggestWord(v)); }

  async function create(e: React.FormEvent) {
    e.preventDefault(); if (problems.length) return;
    setBusy(true); setMsg(""); setSecret(null);
    const r = await call("POST", { action: "create", name, word, ownerEmail: owner });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || "Could not create."); return; }
    setSecret({ email: r.j.ownerEmail, password: r.j.password, word: r.j.word, society: name.trim() });
    setName(""); setWord(""); setWordEdited(false); setOwner(""); load();
  }
  async function reset(s: Item) {
    setConfirmReset(null); setBusy(true); setMsg(""); setSecret(null);
    const r = await call("POST", { action: "reset_owner", id: s.id });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || "Could not reset."); return; }
    setSecret({ email: r.j.email, password: r.j.password, word: s.slug, society: s.name });
  }
  function copy(key: string, text: string) { try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? "" : c)), 2000); } catch {} }

  const totals = platformTotals(items || []);
  const shown = (items || []).filter((s) => !q.trim() || `${s.name} ${s.slug} ${s.owner_email || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const box = "border border-[var(--border)] bg-[var(--surface)] p-4";
  const addr = (w: string) => `${origin}/${w}`;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="sticky top-0 z-20 bg-[var(--navy)] text-[#fdfcf5] mono text-[12px] tracking-[0.06em]">
        <div className="mx-auto max-w-[900px] px-4 min-h-[48px] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold uppercase">GrihSahara • Platform</div>
            {signedIn && who && <div className="opacity-70 normal-case truncate text-[11px]">{who}</div>}
          </div>
          {signedIn && <button onClick={signOut} className="min-h-[44px] px-3 underline shrink-0">Sign out</button>}
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-4 py-5 space-y-5">
        {signedIn === null && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className={box + " h-24 animate-pulse"} />)}</div>}

        {signedIn === false && (
          <form onSubmit={signIn} className={box + " space-y-3 max-w-[420px] mx-auto mt-6"}>
            <div>
              <div className="serif text-[22px]">Product owner</div>
              <div className="mono text-[12px] opacity-70 mt-1">Sign in to create and look after societies.</div>
            </div>
            <input className="field" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="field" type="password" autoComplete="current-password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} required />
            <button className="btn-navy w-full min-h-[44px] font-bold" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        )}

        {msg && (
          <div className="mono text-[12px] border border-red-300 bg-red-50 text-red-800 p-3 flex items-start justify-between gap-3" role="alert">
            <span className="min-w-0 break-words">{msg}</span>
            {signedIn && <button className="underline shrink-0 min-h-[44px]" onClick={load}>Try again</button>}
          </div>
        )}

        {secret && (
          <div ref={secretRef} className="border-2 border-[var(--gold)] bg-[var(--gold-soft)] p-4 space-y-2 scroll-mt-20" role="status">
            <div className="mono text-[11px] font-bold tracking-[0.1em]">SHOWN ONCE — GIVE IT TO THE SOCIETY OWNER</div>
            {secret.society && <div className="serif text-[18px] break-words">{secret.society}</div>}
            {secret.word && <div className="mono text-[13px] break-all">Address: {addr(secret.word)}</div>}
            <div className="mono text-[13px] break-all">Email: {secret.email}</div>
            <div className="mono text-[13px] break-all">First password: <b className="text-[15px] select-all">{secret.password}</b></div>
            <div className="mono text-[11px] opacity-70">They must choose a new password at the first login.</div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-navy min-h-[44px] px-4 text-[12px] font-bold"
                onClick={() => copy("all", `${secret.society ? secret.society + "\n" : ""}${secret.word ? `Address: ${addr(secret.word)}\n` : ""}Email: ${secret.email}\nFirst password: ${secret.password}`)}>{copied === "all" ? "Copied ✓" : "Copy all details"}</button>
              <button type="button" className="btn-line min-h-[44px] px-4 text-[12px]" onClick={() => setSecret(null)}>I have copied it</button>
            </div>
          </div>
        )}

        {signedIn && loading && !items && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className={box + " h-28 animate-pulse"} />)}</div>}

        {signedIn && items && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat n={totals.societies} label="Societies" />
              <Stat n={totals.active} label="Active" />
              <Stat n={totals.flats} label="Flats" />
              <Stat n={totals.logins} label="Logins" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="serif text-[20px]">Societies</div>
              <button onClick={load} disabled={loading} className="btn-line min-h-[44px] px-3 text-[12px]">{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
            {items.length > 4 && <input className="field" placeholder="Search name, word or owner" value={q} onChange={(e) => setQ(e.target.value)} />}

            <div className="space-y-3">
              {shown.map((s) => (
                <div key={s.id} className={box + " min-w-0 space-y-3"}>
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 bg-[var(--navy)] text-[var(--gold)] serif text-[20px] flex items-center justify-center rounded-[3px]" aria-hidden>{(s.name.trim()[0] || "?").toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold break-words">{s.name}</div>
                        <span className={"mono text-[10px] tracking-[0.08em] uppercase px-1.5 py-0.5 border " + (s.status === "active" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800")}>{s.status}</span>
                      </div>
                      <div className="mono text-[12px] opacity-70 break-all">/{s.slug} • since {niceDate(s.created_at)}</div>
                    </div>
                  </div>
                  <div className="mono text-[12px] break-all"><span className="opacity-60">Owner:</span> {s.owner_email || "none yet"}</div>
                  <div className="grid grid-cols-4 gap-2">
                    <Stat n={s.flats} label="Flats" />
                    <Stat n={s.logins.committee} label="Committee" />
                    <Stat n={s.logins.flat} label="Flat logins" />
                    <Stat n={s.logins.tenant} label="Tenants" />
                  </div>
                  {confirmReset === s.id ? (
                    <div className="border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <div className="mono text-[12px]">Reset the owner&apos;s password? The old one stops working at once.</div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => reset(s)} disabled={busy} className="btn-navy min-h-[44px] px-4 text-[12px] font-bold">{busy ? "…" : "Yes, reset"}</button>
                        <button onClick={() => setConfirmReset(null)} className="btn-line min-h-[44px] px-4 text-[12px]">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => copy(s.id, addr(s.slug))} className="btn-line min-h-[44px] px-4 text-[12px]">{copied === s.id ? "Copied ✓" : "Copy address"}</button>
                      <button onClick={() => setConfirmReset(s.id)} disabled={busy || !s.owner_email} className="btn-line min-h-[44px] px-4 text-[12px]">Reset owner</button>
                    </div>
                  )}
                </div>
              ))}
              {!shown.length && <div className={box + " mono text-[12px] opacity-70"}>{items.length ? "No society matches your search." : "No society yet. Create the first one below."}</div>}
            </div>

            <form onSubmit={create} className={box + " space-y-3"}>
              <div>
                <div className="serif text-[20px]">New society</div>
                <div className="mono text-[12px] opacity-70 mt-1">Makes the society and its owner login. The owner sets up towers, flats and committee logins.</div>
              </div>
              <label className="block"><span className="mono text-[11px] tracking-[0.08em] uppercase opacity-70">Society name</span>
                <input className="field mt-1" placeholder="e.g. Green Park Co-op Housing Society" value={name} onChange={(e) => onName(e.target.value)} required /></label>
              <label className="block"><span className="mono text-[11px] tracking-[0.08em] uppercase opacity-70">Society word (its web address)</span>
                <input className="field mt-1" placeholder="green-park" value={word} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  onChange={(e) => { setWordEdited(true); setWord(e.target.value.toLowerCase().replace(/\s+/g, "-")); }} required /></label>
              <div className="mono text-[12px] break-all opacity-80">Address: {origin}/<b>{word || "…"}</b></div>
              <label className="block"><span className="mono text-[11px] tracking-[0.08em] uppercase opacity-70">Society owner&apos;s email</span>
                <input className="field mt-1" type="email" inputMode="email" autoCapitalize="none" placeholder="owner@example.com" value={owner} onChange={(e) => setOwner(e.target.value)} required /></label>
              {problems.length > 0 && (name || word || owner) && (
                <ul className="mono text-[11px] opacity-70 list-disc pl-5 space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              )}
              <button className="btn-navy w-full min-h-[44px] font-bold" disabled={busy || problems.length > 0}>{busy ? "Creating…" : "Create society"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
