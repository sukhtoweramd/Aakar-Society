// Reads the AI's reply for the HELP assistant. Pure, so tests can load it.
// The prompt asks for "NOT_FOUND" ONLY when the guide has nothing relevant. The small model sometimes writes NOT_FOUND and then answers
// anyway (or adds the coordinator sentence after a real answer). A reply that still contains a real answer is shown as an answer, not as "not found".
const COORDINATOR = /(contact|ask|reach|speak|approach)[^.!?\n]{0,60}(coordinator|committee member|committee)/i;

export function cleanAnswer(raw: string): { answer: string; notFound: boolean } {
  const text = String(raw ?? "").trim();
  const flagged = /^\s*NOT_FOUND\b/i.test(text);
  const body = text.replace(/^\s*NOT_FOUND\s*[:.\-]?\s*/i, "").trim();
  if (!flagged) return { answer: body, notFound: false };
  // sentences / lines that are only the "contact the coordinator" advice
  const parts = body.split(/(?<=[.!?])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
  const real = parts.filter((p) => !COORDINATOR.test(p) && p.replace(/[^A-Za-z0-9\u00C0-\u024F\u0900-\u097F\u0A80-\u0AFF]/g, "").length >= 12);
  if (real.length) return { answer: real.join("\n").trim(), notFound: false };
  return { answer: body, notFound: true };
}
