// Shared types and helpers for the Society Ledger app.

export type Flat = {
  id: string;
  tower: string | null;
  floor: number | null;
  flat_no: string | null;
  bhk: string | null;
  maintenance: number | null;
  sqft?: number | null;
  email: string | null;
  owner_name: string | null;
  is_committee: boolean | null;
  status: string | null;
  r2_url?: string | null;
  // Owner / tenant (TENANTS.sql)
  occupancy?: "owner" | "tenant" | null;
  owner_mobile?: string | null;
  owner_address?: string | null;
  tenant_name?: string | null;
  tenant_from?: string | null;
  agreement_until?: string | null;
  committee_role?: string | null; // COMMITTEE_ROLES.sql
  member_since?: string | null; // PRE_PHASE2_A.sql
  share_cert_no?: string | null;
  committee_person?: string | null; // COMMITTEE_PERSON.sql: the family member on the committee (empty = owner)
  committee_members?: CommitteePerson[] | null; // COMMITTEE_PEOPLE.sql: everyone of this flat on the committee
};

export type Notice = { id: string; title: string | null; content: string | null; tower: string | null; file_url?: string | null; created_by?: string | null; created_at: string };
export type EventRow = { id: string; title: string | null; event_date: string | null; end_date?: string | null; type: string | null; description: string | null };
export type Business = { id: string; flat_id: string | null; business_name: string | null; category: string | null; mobile: string | null; description: string | null };
export type StoredFile = { key: string; name: string; url: string; size: number; uploaded: string | null };

export const SOCIETY = {
  name: "AAKAR CO-OP",
  full: "AAKAR CO-OP HOUSING SOCIETY LTD.",
  reg: "G-16551",
  regDate: "16-03-1994",
  building: "SUKH TOWER",
  address: "Sukh Tower, Mirambica Road, Naranpura, Ahmedabad",
  addressLines: ["Mirambica Road Naranpura", "Ahmedabad - 380013"],
};

/** Number part of a flat id: "A1001" -> 1001 */
// The 4 BHK homes of the B building are two numbers joined (flat_no "B101/102", id "B101"; shown under Tower C).
// The first number decides floor and order.
export const flatNumber = (f: Flat) => parseInt(((f.flat_no || f.id).match(/\d+/) || ["0"])[0], 10) || 0;
/** Floor from the DB, or worked out from the number (A1001 -> 10, A204 -> 2) */
export const floorOf = (f: Flat) => f.floor ?? Math.floor(flatNumber(f) / 100);
/** Position on the floor (A1003 -> 3) */
export const unitOf = (f: Flat) => flatNumber(f) % 100;
/** Display label: "A1001" -> "A-1001"; joined home "B101/102" -> "B-101/102" */
export const label = (f: Flat) => {
  const no = (f.flat_no || f.id || "").toUpperCase();
  const m = no.match(/^([A-Z])-?(\d+)(?:\/(\d+))?$/);
  return m ? `${m[1]}-${m[2]}${m[3] ? `/${m[3]}` : ""}` : no;
};
export const isOccupied = (f: Flat) => ["filled", "occupied", "sold", "approved"].includes((f.status || "").toLowerCase());
export const statusText = (f: Flat) => (isOccupied(f) ? "Occupied" : f.status ? f.status[0].toUpperCase() + f.status.slice(1) : "Pending");
export const ownerText = (f: Flat) => f.owner_name?.trim() || "Owner not recorded";
/** Committee designations, in display order. Anything else is typed in under "Other". */
export const COMMITTEE_ROLES = ["Chairman", "Secretary", "Treasurer", "Committee Member", "Co-opted Member", "Social Committee"];
const roleRank = (r?: string | null) => { const i = COMMITTEE_ROLES.findIndex((x) => x.toLowerCase() === (r || "").toLowerCase()); return i < 0 ? (r ? COMMITTEE_ROLES.length : 99) : i; };
/** Sort committee flats: Chairman, Secretary, Treasurer … then others. */
export const byCommitteeRole = (a: Pick<Flat, "committee_role">, b: Pick<Flat, "committee_role">) => roleRank(a.committee_role) - roleRank(b.committee_role);
export type CommitteePerson = { name: string; role: string };
type CF = Pick<Flat, "is_committee" | "committee_role" | "owner_name"> & { committee_person?: string | null; committee_members?: CommitteePerson[] | null };
/** Everyone of this flat on the committee, highest designation first. No list yet: the chosen person or the owner, with the flat's designation. */
export function committeePeople(f: CF): CommitteePerson[] {
  const list = (Array.isArray(f.committee_members) ? f.committee_members : []).filter((p) => p?.name?.trim())
    .map((p) => ({ name: p.name.trim(), role: (p.role || "").trim() || "Committee Member" }));
  if (list.length) return list.sort((a, b) => roleRank(a.role) - roleRank(b.role));
  if (!f.is_committee) return [];
  return [{ name: f.committee_person?.trim() || f.owner_name?.trim() || "Owner not recorded", role: f.committee_role?.trim() || "Committee Member" }];
}
/** Highest designation in a list (for the flat's own designation). */
export const topRole = (people: CommitteePerson[]) => [...people].sort((a, b) => roleRank(a.role) - roleRank(b.role))[0]?.role || null;
/** Names of the committee members of this flat ("A & B"), else the owner. */
export const committeeName = (f: CF) => committeePeople(f).map((p) => p.name).join(" & ") || f.owner_name?.trim() || "Owner not recorded";
/** "A (Committee Member), B (Co-opted Member)" */
export const committeeText = (f: CF) => committeePeople(f).map((p) => `${p.name} (${p.role})`).join(", ");
/** "★ Secretary" or "★ Committee" */
export const committeeBadge = (f: Pick<Flat, "is_committee" | "committee_role">) => (f.is_committee ? `★ ${f.committee_role?.trim() || "Committee"}` : "");
/** Family order everywhere: head first, then self, spouse, children, parents, others; oldest first within a group. */
const REL_ORDER = [/^self$/i, /^(wife|husband|spouse)$/i, /^(son|daughter)$/i, /^(father|mother)$/i];
export const relationRank = (r?: string | null) => { const i = REL_ORDER.findIndex((x) => x.test((r || "").trim())); return i < 0 ? REL_ORDER.length : i; };
export const byFamilyOrder = (a: { is_head?: boolean | null; relation?: string | null; age?: number | null; name?: string | null }, b: typeof a) =>
  Number(!!b.is_head) - Number(!!a.is_head) || relationRank(a.relation) - relationRank(b.relation) || (b.age ?? 0) - (a.age ?? 0) || (a.name || "").localeCompare(b.name || "");
export const isRented = (f: Pick<Flat, "occupancy">) => f.occupancy === "tenant";
/** Who lives in the flat: the tenant when rented out, otherwise the owner. */
export const residentName = (f: Flat) => (isRented(f) ? f.tenant_name?.trim() || "" : f.owner_name?.trim() || "");
export const rupees = (n: number | null | undefined) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);

export const sortFlats = (a: Flat, b: Flat) => (a.tower || "").localeCompare(b.tower || "") || flatNumber(a) - flatNumber(b);

/** A charges category: the standard floors or the top (terrace) floor of one tower. */
export type Category = {
  key: string; // e.g. "A_STD" / "A_TERRACE"
  tower: string;
  terrace: boolean;
  label: string;
  floors: string;
  ids: string[];
  range: string;
  maint: number | null;
  sqft: number | null;
  bhk: string;
};

// Society-approved default rates (from the original ledger design)
export const DEFAULT_RATES: Record<string, { maint: number; sqft: number; bhk: string }> = {
  A_STD: { maint: 3500, sqft: 1650, bhk: "3BHK" },
  A_TERRACE: { maint: 5000, sqft: 1850, bhk: "3BHK+T" },
  B_STD: { maint: 2500, sqft: 1100, bhk: "2BHK" },
  B_TERRACE: { maint: 4000, sqft: 1300, bhk: "2BHK+T" },
  C_STD: { maint: 2000, sqft: 950, bhk: "4BHK" },   // placeholder amounts: 4 BHK homes B?01+B?02 (set real ones in ADMIN)
  C_TERRACE: { maint: 3200, sqft: 1150, bhk: "4BHK+T" },
};

const mostCommon = <T,>(vals: T[]): T | null => {
  const counts = new Map<T, number>();
  vals.forEach((v) => v != null && counts.set(v, (counts.get(v) || 0) + 1));
  let best: T | null = null, n = 0;
  counts.forEach((c, v) => { if (c > n) { n = c; best = v; } });
  return best;
};

/** Build categories from the real flats: per tower, top floor = terrace, the rest = standard. */
export function buildCategories(flats: Flat[]): Category[] {
  const out: Category[] = [];
  const towers = Array.from(new Set(flats.map((f) => f.tower).filter(Boolean))).sort() as string[];
  for (const t of towers) {
    const inTower = flats.filter((f) => f.tower === t).sort(sortFlats);
    const top = Math.max(...inTower.map(floorOf));
    const groups: [boolean, Flat[]][] = [
      [false, inTower.filter((f) => floorOf(f) < top)],
      [true, inTower.filter((f) => floorOf(f) === top)],
    ];
    for (const [terrace, list] of groups) {
      if (!list.length) continue;
      const floors = Array.from(new Set(list.map(floorOf))).sort((a, b) => a - b);
      const floorText = floors.length > 1 ? `${floors[0]}-${floors[floors.length - 1]}` : `${floors[0]}`;
      out.push({
        key: `${t}_${terrace ? "TERRACE" : "STD"}`,
        tower: t,
        terrace,
        label: terrace ? `TOWER ${t} FLOOR ${floorText} TERRACE` : `TOWER ${t} FLOORS ${floorText}`,
        floors: floorText,
        ids: list.map((f) => f.id),
        range: `${list[0].id}-${list[list.length - 1].id}`,
        maint: mostCommon(list.map((f) => f.maintenance)),
        sqft: mostCommon(list.map((f) => f.sqft ?? null)),
        bhk: mostCommon(list.map((f) => f.bhk)) || "",
      });
    }
  }
  return out;
}

export const VAULT_SLOTS = [
  { id: "registration-certificate", name: "Registration Certificate" },
  { id: "bye-laws", name: "Society Bye-laws" },
  { id: "terrace-ownership", name: "Terrace Ownership Agreement", important: true },
  { id: "building-plan", name: "Building Plan Approval" },
  { id: "fire-noc", name: "Fire NOC" },
  { id: "lift-amc", name: "Lift AMC" },
];

/** Sidebar filter: "ALL", a tower letter ("A"), or a category key ("A_TERRACE" / "A_STD"). */
export function inFilter(f: Flat, filter: string, categories: Category[]): boolean {
  if (filter === "ALL") return true;
  if (filter === "COMMITTEE") return !!f.is_committee;
  if (filter.includes("_")) return !!categories.find((c) => c.key === filter)?.ids.includes(f.id);
  return f.tower === filter;
}
export function filterName(filter: string, categories: Category[]): string {
  if (filter === "ALL") return "All towers";
  if (filter === "COMMITTEE") return "Committee members";
  const c = categories.find((x) => x.key === filter);
  if (c) return c.terrace ? `Tower ${c.tower} floor ${c.floors} (terrace)` : `Tower ${c.tower} floors ${c.floors}`;
  return `Tower ${filter}`;
}

/** Family-member summary used by reports: head (owner), spouse, profession, mobile. */
export type MemberLite = { flat_id: string; name: string | null; relation: string | null; mobile: string | null; email?: string | null; is_head: boolean | null; occupation?: string | null; business_name?: string | null };
const SPOUSE = /^(wife|husband|spouse|mrs\.?|mr\.?)$/i;
export function familySummary(flat: Flat, members: MemberLite[]) {
  const mine = members.filter((m) => m.flat_id === flat.id);
  // The family list belongs to whoever lives there: the tenant if rented out.
  const owner = residentName(flat).toLowerCase();
  const head =
    mine.find((m) => m.is_head) ||
    mine.find((m) => /^self$/i.test(m.relation || "")) ||
    (owner ? mine.find((m) => m.name && owner.includes(m.name.toLowerCase())) : undefined) ||
    null;
  const spouse = mine.find((m) => m !== head && SPOUSE.test((m.relation || "").trim())) || null;
  const profession = head ? [head.occupation, head.business_name].filter(Boolean).join(" • ") : "";
  const mobile = head?.mobile || spouse?.mobile || "";
  return { head, spouse, profession, mobile, count: mine.length };
}
