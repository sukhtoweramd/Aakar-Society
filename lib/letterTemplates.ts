// Standard letter formats (LETTER_TEMPLATES.sql, 30 Oct 2026). No database code here, so tests can load it.
export type LetterTemplate = {
  id: string; name: string; kind: "general" | "bank" | "resolution"; subject: string; addressee: string | null; body: string;
  sort: number; active: boolean; updated_at?: string; updated_by?: string | null;
  // RESOLUTION_REQUESTS.sql: the name members pick when asking, and the fill-in fields asked from the member
  request_name?: string | null; member_fields?: string[] | null;
};

/** What a member sees and picks when asking for this letter (blank request name = the format's own name). */
export const askName = (t: Pick<LetterTemplate, "name" | "request_name">) => (t.request_name || "").trim() || t.name;

/** Fields a format may use, with what fills them. Shown to the committee when editing a format. */
export const TEMPLATE_FIELDS: { key: string; what: string }[] = [
  { key: "owner_name", what: "member (owner) name" },
  { key: "flat_no", what: "flat number, e.g. A-101" },
  { key: "tower", what: "tower" },
  { key: "floor", what: "floor" },
  { key: "share_cert_no", what: "share certificate no." },
  { key: "member_since", what: "member since (date)" },
  { key: "tenant_name", what: "tenant name (rented flat)" },
  { key: "date", what: "today's date" },
  { key: "addressee", what: "who the letter is addressed to" },
  { key: "purpose", what: "the member's purpose / details" },
  { key: "dues", what: "maintenance outstanding today, e.g. ₹0 (nil)" },
  { key: "society", what: "society name" },
  { key: "building", what: "building name" },
];

/** Replaces {{field}} with its value. A field with no value is left as "______" so the committee sees it in the draft. */
export function fillTemplate(text: string, data: Record<string, string | null | undefined>): string {
  return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => {
    if (!(k in data)) return `{{${k}}}`;
    const v = (data[k] ?? "").toString().trim();
    return v || (k === "purpose" ? "" : "______");
  }).replace(/\n{3,}/g, "\n\n").trim();
}

const fmt = (d?: string | null) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "");
const flatLabel = (id: string, no?: string | null) => { const m = (no || id || "").toUpperCase().match(/^([A-Z])-?(\d+)(?:\/(\d+))?$/); return m ? `${m[1]}-${m[2]}${m[3] ? `/${m[3]}` : ""}` : (no || id); };

/** The values for one flat (from the society's records). dues = outstanding amount in rupees, or null if not known. */
export function letterData(f: { id: string; flat_no?: string | null; tower?: string | null; floor?: number | null; owner_name?: string | null;
  share_cert_no?: string | null; member_since?: string | null; tenant_name?: string | null },
  o: { addressee?: string | null; purpose?: string | null; dues?: number | null; date?: string; society: string; building: string }): Record<string, string> {
  const dues = o.dues == null ? "" : o.dues <= 0 ? "₹0 (nil)" : `₹${Number(o.dues).toLocaleString("en-IN")}`;
  return {
    owner_name: f.owner_name || "", flat_no: flatLabel(f.id, f.flat_no), tower: f.tower || "", floor: f.floor != null ? String(f.floor) : "",
    share_cert_no: f.share_cert_no || "", member_since: fmt(f.member_since), tenant_name: f.tenant_name || "",
    date: fmt(o.date || new Date().toISOString().slice(0, 10)), addressee: (o.addressee || "").split("\n")[0], purpose: o.purpose || "", dues,
    society: o.society, building: o.building,
  };
}
