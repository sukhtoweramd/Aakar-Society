// Picks the parts of the HELP guide that answer a question, so the AI reads a short, relevant guide
// instead of the whole 30,000-character text (a long guide made it miss sections such as common plot booking).
// Pure logic, no imports, so tests can load it directly.

export type GuideSection = { title: string; text: string };

/** Splits the guide at "## " headings. Text before the first heading becomes the "intro" section. */
export function splitGuide(guide: string): GuideSection[] {
  const out: GuideSection[] = [];
  let title = "intro";
  let buf: string[] = [];
  for (const line of String(guide || "").split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (buf.join("").trim()) out.push({ title, text: buf.join("\n").trim() });
      title = m[1];
      buf = [line];
    } else buf.push(line);
  }
  if (buf.join("").trim()) out.push({ title, text: buf.join("\n").trim() });
  return out;
}

// Words members use for the same thing (question word → words used in the guide).
const SYNONYMS: Record<string, string[]> = {
  area: ["plot", "booking", "book"], common: ["plot", "booking"], plot: ["booking", "book"], book: ["booking", "plot"],
  booking: ["plot", "book"], reserve: ["booking", "plot"], party: ["booking", "plot"], function: ["booking", "plot"],
  complaint: ["complaints"], complain: ["complaints", "complaint"], problem: ["complaints", "complaint"], issue: ["complaints", "complaint"],
  lift: ["complaints", "complaint"], leak: ["complaints", "complaint"], repair: ["complaints", "complaint"],
  pay: ["paid", "bills", "payment"], paid: ["pay", "bills", "payment"], payment: ["paid", "bills"], maintenance: ["bills", "paid"],
  bill: ["bills"], receipt: ["receipts", "bills"], dues: ["bills", "outstanding"], ledger: ["bills"],
  letter: ["letters", "request"], noc: ["letters", "letter"], certificate: ["letters", "letter"], transfer: ["letters", "resolution"],
  login: ["logging", "password"], password: ["logging", "login"], signup: ["logging", "login"], register: ["registration", "events"],
  pass: ["passes", "events"], event: ["events"], navratri: ["events"], garba: ["events"],
  nominee: ["nominee", "nomination"], nomination: ["nominee"], tenant: ["tenant", "rented"], rent: ["tenant", "rented"],
  family: ["family"], vehicle: ["vehicles"], car: ["vehicles"], document: ["documents"], minutes: ["meetings", "minutes"],
  meeting: ["meetings", "minutes"], notice: ["notices", "banners"], banner: ["notices", "banners"], contact: ["contacts", "contact"],
  directory: ["directory"], business: ["business"],
};
const STOP = new Set(["the", "and", "for", "how", "can", "what", "when", "where", "who", "why", "does", "this", "that", "with",
  "from", "into", "your", "you", "are", "was", "has", "have", "get", "use", "app", "please", "need", "want", "will", "about", "there", "which"]);

function words(s: string): string[] {
  return String(s || "").toLowerCase().replace(/[^a-z0-9ऀ-૿\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
function stem(w: string) { return w.replace(/(ings|ing|es|s)$/, "") || w; }

/** Question words, their simple stems and their synonyms. */
export function questionTerms(question: string): string[] {
  const set = new Set<string>();
  for (const w of words(question)) {
    for (const x of [w, stem(w)]) { set.add(x); for (const s of SYNONYMS[x] || []) set.add(s); }
  }
  return Array.from(set);
}

/** Score = matches in the heading count 5, matches in the text count 1 each (up to 5 per word). */
export function scoreSection(sec: GuideSection, terms: string[]): number {
  const head = sec.title.toLowerCase();
  const body = sec.text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (head.includes(t)) score += 5;
    const hits = body.split(t).length - 1;
    score += Math.min(hits, 5);
  }
  return score;
}

const ALWAYS = /^(intro|about the app|finding your way)$/i;

/**
 * The guide text to send for one question: the intro sections plus the best-matching sections, at most maxChars long.
 * If nothing matches (or the guide has no headings), the whole guide is used.
 */
export function pickGuide(guide: string, question: string, opts: { maxSections?: number; maxChars?: number } = {}): string {
  const maxSections = opts.maxSections ?? 3;
  const maxChars = opts.maxChars ?? 12000;
  const secs = splitGuide(guide);
  if (secs.length < 3) return guide;
  const terms = questionTerms(question);
  const ranked = secs.map((s, i) => ({ s, i, score: ALWAYS.test(s.title) ? -1 : scoreSection(s, terms) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, maxSections);
  if (!ranked.length) return guide.length <= maxChars * 2 ? guide : guide.slice(0, maxChars * 2);
  // Fill in order of importance (overview first, then best match), then print in the guide's own order.
  const order: number[] = [];
  secs.forEach((s, i) => { if (ALWAYS.test(s.title)) order.push(i); });
  for (const r of ranked) order.push(r.i);
  const keep: number[] = [];
  let size = 0;
  for (const i of order) {
    const len = secs[i].text.length + 2;
    if (size + len > maxChars && keep.length) continue;
    keep.push(i); size += len;
  }
  let out = "";
  for (const i of keep.sort((a, b) => a - b)) out += secs[i].text + "\n\n";
  return out.trim();
}
