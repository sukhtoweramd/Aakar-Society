// Small "too many requests" guard (audit PR-3). Kept in server memory, per server instance: on Vercel several
// instances may run, so this is a soft guard against loops and misuse, not a hard cap.
// Pure file (no imports) so tests can use it.
export function makeLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  /** true = allowed (and counted); false = over the limit (not counted). */
  return function allow(key: string): boolean {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) hits.forEach((v, k) => { if (!v.some((x: number) => t - x < windowMs)) hits.delete(k); }); // keep memory small
    return true;
  };
}
