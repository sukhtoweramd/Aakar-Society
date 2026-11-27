"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PasswordInput from "./PasswordInput";
import { supabase } from "@/lib/supabaseClient";
import { nameLines, nameSuffix, SOCIETY } from "@/lib/society";
import { flatEmail, parseLogin, rulesFor, tenantEmail } from "@/lib/residents";
import { InstallApp } from "./PwaRegister";
import { cleanWord, FIRST_SOCIETY_WORD, usesLegacyAddress, wordFromPath } from "@/lib/societyWord";
import SocietyLogo from "./SocietyLogo";
import { markOf } from "@/lib/societyLogo";

const WORD_KEY = "society-word";
// The app swaps this screen for the ledger the moment a login succeeds, so a refusal made after that is kept here and shown when the login screen comes back.
const NOTICE_KEY = "login-notice";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Society word (multi-tenant): from the web address (/sample-gardens) or typed in the box; empty = the first society, exactly as before.
  const pathWord = wordFromPath(usePathname());
  const [typedWord, setTypedWord] = useState("");
  const word = pathWord || cleanWord(typedWord);
  const [society, setSociety] = useState<{ slug: string; name: string; logo?: string } | null>(null);
  const [lookedUp, setLookedUp] = useState(false);
  useEffect(() => { try { const n = window.sessionStorage.getItem(NOTICE_KEY); if (n) { window.sessionStorage.removeItem(NOTICE_KEY); setError(n); } } catch {} }, []);
  useEffect(() => { try { const w = window.localStorage.getItem(WORD_KEY); if (w && !pathWord) setTypedWord(w); } catch {} }, [pathWord]);
  useEffect(() => {
    let alive = true;
    setSociety(null); setLookedUp(false);
    if (!word) return;
    supabase.rpc("society_public", { p_word: word }).then(({ data, error }) => {
      if (!alive) return;
      if (!error && data) setSociety(data as { slug: string; name: string; logo?: string });
      setLookedUp(!error);           // an error = the database function is not installed yet: act as if no word check exists
    });
    return () => { alive = false; };
  }, [word]);
  const unknownWord = !!word && lookedUp && !society;
  const otherSociety = society && society.slug !== FIRST_SOCIETY_WORD ? society : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    // Residents type their flat number (A-101); committee members type their email.
    const who = email.includes("@") ? null : parseLogin(email, rulesFor(word));   // the flat-number rule of the society being logged into
    const flat = who?.flat || null;
    if (!email.includes("@") && !flat) { setBusy(false); setError("Enter your email, or your flat number like A-101"); return; }
    if (unknownWord) { setBusy(false); setError("No society found with this word. Check the address or the word you were given."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: who ? (who.tenant ? tenantEmail(who.flat, word) : flatEmail(who.flat, word)) : email.trim(), password: pass });
    if (error) { setBusy(false); setError(error.message === "Invalid login credentials" ? "Wrong flat number / email or password" : error.message); return; }
    try { if (!pathWord) { if (word) window.localStorage.setItem(WORD_KEY, word); else window.localStorage.removeItem(WORD_KEY); } } catch {}
    // A login of another society than the address says: tell the member where to go (needs MT_16; without it nothing is checked).
    if (word) {
      const { data: mine, error: me } = await supabase.rpc("my_society");
      const slug = (mine as { slug?: string } | null)?.slug;
      if (!me && slug && slug !== word && !(usesLegacyAddress(word) && usesLegacyAddress(slug))) {
        const msg = `This login is not for this address. It belongs to ${(mine as { name?: string }).name || slug}. Open that society's own address (/${slug}) and log in there.`;
        try { window.sessionStorage.setItem(NOTICE_KEY, msg); } catch {}
        await supabase.auth.signOut();
        setBusy(false);
        setError(msg);
        return;
      }
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <div className="w-full bg-[var(--navy)] text-[#fdfcf5] mono text-[12px] tracking-[0.06em] uppercase">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 min-h-[38px] py-1.5 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
            SOCIETY LEDGER
          </span>
          <span className="opacity-40">•</span>
          <span>{SOCIETY.city.toUpperCase()}</span>
          <span className="opacity-40">•</span>
          <span className="text-[var(--gold)] font-semibold">{SOCIETY.reg}</span>
        </div>
      </div>
      <div className="flex-1 grid place-items-center p-4">
        <div className="w-full max-w-[920px] grid md:grid-cols-[1fr_1fr] border border-[var(--border)] rounded-[4px] overflow-hidden bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="bg-[var(--navy)] text-[#fdfcf5] p-8 md:p-10 flex flex-col justify-between">
            <div>
              <SocietyLogo className="h-14 w-14 rounded-full border border-[var(--gold)] grid place-items-center text-[30px] serif text-[var(--gold)]" mark={markOf({ logo: otherSociety ? otherSociety.logo : SOCIETY.logo, name: otherSociety?.name || SOCIETY.name, first: usesLegacyAddress(word) })} />
              <h1 className="serif text-[40px] leading-[0.95] mt-6 tracking-[0.02em] font-[800]">{nameLines(otherSociety?.name || SOCIETY.name)[0]}{nameLines(otherSociety?.name || SOCIETY.name)[1] && <br />}{nameLines(otherSociety?.name || SOCIETY.name)[1]}</h1>
              {!otherSociety && <div className="mono text-[11px] tracking-[0.3em] mt-3 opacity-80">{nameSuffix()}</div>}
            </div>
            {!otherSociety && <div className="mono text-[11px] mt-10 opacity-80 leading-relaxed">
              {SOCIETY.building} • REG NO {SOCIETY.reg}<br />
              DATE {SOCIETY.regDate}<br />
              {SOCIETY.addressLines.join(" • ")}
            </div>}
          </div>
          <form onSubmit={submit} className="p-8 md:p-10">
            <div className="serif text-[22px] font-bold">Member Login</div>
            <div className="mono text-[11px] opacity-60 mt-1">Residents: log in with your flat number. Committee: log in with your email.</div>
            <div className="mt-6 space-y-4">
              <label className="block">
                <div className="mono text-[10px] tracking-[0.16em]">FLAT NUMBER OR EMAIL</div>
                <input type="text" autoComplete="username" autoCapitalize="characters" required value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1 mono" placeholder="A-101  or  you@example.com" />
              </label>
              {!pathWord && (
                <label className="block">
                  <div className="mono text-[10px] tracking-[0.16em]">SOCIETY WORD <span className="opacity-60">(only if your society gave you one)</span></div>
                  <input type="text" autoCapitalize="none" autoCorrect="off" value={typedWord} onChange={(e) => setTypedWord(e.target.value)} className="field mt-1 mono" placeholder="e.g. sample-gardens" />
                  {society && <div className="mono text-[11px] mt-1 text-green-800">{society.name}</div>}
                  {unknownWord && <div className="mono text-[11px] mt-1 text-red-700">No society with this word.</div>}
                </label>
              )}
              {pathWord && unknownWord && <div className="mono text-[12px] text-red-700 border border-red-200 bg-red-50 px-3 py-2">No society found at this address.</div>}
              <div className="block">
                <div className="mono text-[10px] tracking-[0.16em]">PASSWORD</div>
                <PasswordInput autoComplete="current-password" required value={pass} onChange={setPass} />
              </div>
              {error && <div className="mono text-[12px] text-red-700 border border-red-200 bg-red-50 px-3 py-2">{error}</div>}
              <button disabled={busy} className="btn-navy w-full mono text-[12px] tracking-[0.16em] py-3">{busy ? "CHECKING…" : "LOGIN"}</button>
              <div className="mono text-[10px] opacity-50 text-center">No password yet, or forgot it? Ask the society committee.</div>
              <InstallApp variant="card" />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
