// Phone home screen (30 Oct 2026): one screen of buttons; each button opens one function on its own screen with a
// HOME button back. Pure lists only (no database code), so tests can load it. Which data each login may read is still
// decided by the database rules; these lists only decide which buttons are drawn.
import type { Tab } from "../app/ledger/ctx";

/** A part of MY FLAT that a phone shows on its own screen. */
export type Section =
  | "bills" | "family" | "vehicles" | "emergency" | "documents" | "letters" | "complaints" | "booking"
  | "nominee" | "contacts" | "details" | "actions";

export type Tile = { key: string; label: string; icon: string; section?: Section; tab?: Tab };

export const SECTION_TITLE: Record<Section, string> = {
  bills: "Bills & ledger", family: "My family", vehicles: "My vehicles", emergency: "Emergency contacts",
  documents: "Documents", letters: "My letters", complaints: "Complaints", booking: "Book common plot",
  nominee: "Nominee", contacts: "Who to contact", details: "My details", actions: "Action points",
};

export const TAB_TITLE: Partial<Record<Tab, string>> = {
  COVER: "Society", INDEX: "Flat index", FLOOR: "Floors", DETAIL: "Flat detail", BUSINESS: "Business directory",
  DIRECTORY: "Directory", VAULT: "Vault", NOTICES: "Notices", CONTACTS: "Contacts", EVENTS: "Events",
  BILLING: "Billing", COMMITTEE: "Committee", ADMIN: "Admin", REPORTS: "Reports",
};

const S = (section: Section, label: string, icon: string): Tile => ({ key: section, label, icon, section });
const T = (tab: Tab, label: string, icon: string): Tile => ({ key: tab, label, icon, tab });

/** Society screens a member can be given (ADMIN → MEMBER SCREENS decides which are open). */
const SOCIETY_TILES: Tile[] = [
  T("NOTICES", "NOTICES", "notice"), T("EVENTS", "EVENTS", "ticket"), T("CONTACTS", "CONTACTS", "book"),
  T("DIRECTORY", "DIRECTORY", "list"), T("BUSINESS", "BUSINESS", "briefcase"), T("VAULT", "VAULT", "lock"),
  T("COVER", "SOCIETY", "building"), T("INDEX", "FLAT INDEX", "grid"), T("FLOOR", "FLOORS", "layers"),
];
const societyFor = (allowed: Tab[]) => SOCIETY_TILES.filter((t) => allowed.includes(t.tab!));

/** Owner (flat login). Nominee also for a rented flat (sql-security/11: the flat login is the owner's since tenants
 *  have their own logins); Action points only when the member has open ones. */
export function memberMenu(o: { rented: boolean; allowed: Tab[]; openActions: number }): { flat: Tile[]; society: Tile[] } {
  const flat: Tile[] = [
    S("bills", "BILLS & LEDGER", "bill"), S("family", "MY FAMILY", "family"), S("vehicles", "MY VEHICLES", "car"),
    S("documents", "DOCUMENTS", "folder"), S("letters", "MY LETTERS", "mail"), S("complaints", "COMPLAINTS", "alert"),
    S("booking", "BOOK PLOT", "calendar"),
    S("nominee", "NOMINEE", "person"),
    S("emergency", "EMERGENCY", "phone"), S("contacts", "WHO TO CONTACT", "headset"), S("details", "MY DETAILS", "card"),
    ...(o.openActions > 0 ? [S("actions", "ACTION POINTS", "check")] : []),
  ];
  return { flat, society: societyFor(o.allowed) };
}

/** Tenant login: only what is opened to tenants on purpose (CLAUDE.md, TENANT_LOGINS.sql). */
export function tenantMenu(o: { allowed: Tab[] }): { flat: Tile[]; society: Tile[] } {
  const flat: Tile[] = [
    S("family", "MY FAMILY", "family"), S("vehicles", "MY VEHICLES", "car"), S("emergency", "EMERGENCY", "phone"),
    S("complaints", "COMPLAINTS", "alert"), S("booking", "BOOK PLOT", "calendar"), S("contacts", "WHO TO CONTACT", "headset"),
  ];
  const society = societyFor(o.allowed).filter((t) => (["NOTICES", "EVENTS", "CONTACTS", "COVER"] as Tab[]).includes(t.tab!));
  return { flat, society };
}

/** Committee login: every committee screen as a button; MY FLAT when the login is linked to a flat. */
export function committeeMenu(o: { homeFlat: boolean }): { work: Tile[]; society: Tile[] } {
  const work: Tile[] = [
    T("BILLING", "BILLING", "bill"), T("COMMITTEE", "COMMITTEE", "people"), T("INDEX", "FLATS", "grid"),
    T("REPORTS", "REPORTS", "chart"), T("ADMIN", "ADMIN", "gear"),
    ...(o.homeFlat ? [{ key: "MYFLAT", label: "MY FLAT", icon: "home", tab: "DETAIL" as Tab }] : []),
  ];
  const society: Tile[] = [
    T("NOTICES", "NOTICES", "notice"), T("EVENTS", "EVENTS", "ticket"), T("CONTACTS", "CONTACTS", "book"),
    T("DIRECTORY", "DIRECTORY", "list"), T("BUSINESS", "BUSINESS", "briefcase"), T("VAULT", "VAULT", "lock"),
    T("COVER", "SOCIETY", "building"), T("FLOOR", "FLOORS", "layers"),
  ];
  return { work, society };
}
