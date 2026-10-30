// Letter requests (26 Oct 2026): a member asks for a letter; the committee issues it from BILLING → LETTERS.
export type LetterRequest = {
  id: string; flat_id: string; letter_type: string; addressee: string | null; purpose: string | null;
  status: "requested" | "approved" | "issued" | "declined" | "withdrawn"; letter_id: string | null; reason: string | null;
  decided_by: string | null; decided_at: string | null; created_by: string | null; created_at: string;
  // LETTER_TEMPLATES.sql
  template_id?: string | null; approved_by?: string | null; approved_at?: string | null;
  history?: { at: string; by: string | null; status: string; note: string | null }[] | null;
};

/** Letter types a member can ask for. The society's standard formats (item 25) will use the same names. */
export const LETTER_TYPES = [
  "NOC for sale of flat",
  "NOC for bank loan",
  "NOC for renting the flat / police verification",
  "Address proof / residence letter",
  "No-dues certificate",
  "Share certificate / membership letter",
  "Other",
];

export const REQ_STATUS: Record<LetterRequest["status"], { text: string; cls: string }> = {
  requested: { text: "WAITING", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  approved: { text: "APPROVED • BEING PREPARED", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  issued: { text: "ISSUED", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  declined: { text: "NOT ISSUED", cls: "bg-red-50 text-red-700 border-red-200" },
  withdrawn: { text: "WITHDRAWN", cls: "bg-gray-100 text-gray-600 border-gray-300" },
};

/** Subject line suggested to the committee when issuing a requested letter. */
export const subjectFor = (r: Pick<LetterRequest, "letter_type" | "purpose">) =>
  r.letter_type === "Other" ? (r.purpose || "").split(/[.\n]/)[0].slice(0, 120) || "Letter" : r.letter_type;
