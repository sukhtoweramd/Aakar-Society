"use client";
// Product owner page: sign in, see every society as counts only, create a society, reset an owner's password.
// The server (/api/platform) decides who may do this; this screen only shows what the server returns.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Item = { id: string; slug: string; name: string; status: string; created_at: string; owner_email: string | null; flats: number; logins: { committee: number; flat: number; tenant: number } };
type Secret = { email: string; password: string; word?: string };

async function call(method: "GET" | "POST", body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || "";
  const r = await fetch("/api/platform", { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

export default function PlatformPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [name, setName] = useState(""); const [word, setWord] = useState(""); const [owner, setOwner] = useState("");

  const load = useCallback(async () => {
    const r = await call("GET");
    if (r.ok) { setItems(r.j.societies); setMsg(""); }
    else { setItems(null); setMsg(r.status === 403 ? "This login is not the product owner." : r.j.error || "Could not load."); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSignedIn(!!data.session); if (data.session) load(); });
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) { setMsg("Wrong email or password."); return; }
    setPass(""); setSignedIn(true); load();
  }
  async function signOut() { await supabase.auth.signOut(); setSignedIn(false); setItems(null); setSecret(null); }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(""); setSecret(null);
    const r = await call("POST", { action: "create", name, word, ownerEmail: owner });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || "Could not create."); return; }
    setSecret({ email: r.j.ownerEmail, password: r.j.password, word: r.j.word });
    setName(""); setWord(""); setOwner(""); load();
  }
  async function reset(id: string) {
    if (!window.confirm("Reset this society owner's password? The old one stops working.")) return;
    setBusy(true); setMsg(""); setSecret(null);
    const r = await call("POST", { action: "reset_owner", id });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || "Could not reset."); return; }
    setSecret({ email: r.j.email, password: r.j.password });
  }

  const box = "border border-[var(--border)] bg-[var(--surface)] p-4";
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="bg-[var(--navy)] text-[#fdfcf5] mono text-[12px] tracking-[0.06em] uppercase">
        <div className="mx-auto max-w-[900px] px-4 min-h-[44px] flex items-center justify-between gap-2">
          <span className="font-semibold">AanganOne • Platform</span>
          {signedIn && <button onClick={signOut} className="min-h-[44px] px-2 underline">Sign out</button>}
        </div>
      </div>
      <div className="mx-auto max-w-[900px] px-4 py-5 space-y-4">
        {signedIn === null && <div className="mono text-[12px] opacity-70">Loading…</div>}

        {signedIn === false && (
          <form onSubmit={signIn} className={box + " space-y-3 max-w-[420px]"}>
            <div className="serif text-[20px]">Product owner sign-in</div>
            <input className="field" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="field" type="password" autoComplete="current-password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} required />
            <button className="btn-navy w-full min-h-[44px] font-bold" disabled={busy}>{busy ? "…" : "Sign in"}</button>
          </form>
        )}

        {msg && <div className="mono text-[12px] border border-red-300 bg-red-50 text-red-800 p-3">{msg}</div>}

        {secret && (
          <div className={box + " space-y-1 border-[var(--gold)]"}>
            <div className="mono text-[11px] font-bold tracking-[0.1em]">SHOWN ONCE — GIVE IT TO THE SOCIETY OWNER</div>
            {secret.word && <div className="mono text-[13px] break-all">Address: /{secret.word}</div>}
            <div className="mono text-[13px] break-all">Email: {secret.email}</div>
            <div className="mono text-[13px] break-all">First password: <b>{secret.password}</b></div>
            <div className="mono text-[11px] opacity-70">They must choose a new password at the first login.</div>
          </div>
        )}

        {signedIn && items && (
          <>
            <div className="serif text-[20px]">Societies ({items.length})</div>
            <div className="space-y-3">
              {items.map((s) => (
                <div key={s.id} className={box + " min-w-0"}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold break-words">{s.name}</div>
                      <div className="mono text-[12px] opacity-70 break-all">/{s.slug} • {s.status} • since {s.created_at.slice(0, 10)}</div>
                    </div>
                    <button onClick={() => reset(s.id)} disabled={busy} className="btn-line min-h-[44px] px-3 text-[12px] shrink-0">Reset owner</button>
                  </div>
                  <div className="mono text-[12px] mt-2 break-all">Owner: {s.owner_email || "none yet"}</div>
                  <div className="mono text-[12px] opacity-80">{s.flats} flats • {s.logins.committee} committee • {s.logins.flat} flat • {s.logins.tenant} tenant logins</div>
                </div>
              ))}
            </div>

            <form onSubmit={create} className={box + " space-y-3"}>
              <div className="serif text-[20px]">New society</div>
              <input className="field" placeholder="Society name" value={name} onChange={(e) => setName(e.target.value)} required />
              <input className="field" placeholder="Society word (small letters, e.g. green-park)" value={word} onChange={(e) => setWord(e.target.value.toLowerCase())} autoCapitalize="none" required />
              <input className="field" type="email" placeholder="Society owner's email" value={owner} onChange={(e) => setOwner(e.target.value)} required />
              <button className="btn-navy w-full min-h-[44px] font-bold" disabled={busy}>{busy ? "…" : "Create society"}</button>
              <div className="mono text-[11px] opacity-70">Makes the society and its owner login (first password shown once). Towers, flats and committee logins are set up by the owner.</div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
