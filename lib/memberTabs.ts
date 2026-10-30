// Which screens (tabs) flat logins can open — chosen by the committee in ADMIN → MEMBER SCREENS.
// MY FLAT and NOTICES are always open; login banners always show. Hiding a tab is a screen setting only:
// the database rules decide what each login can read, whatever is shown.
import type { Tab } from "../app/ledger/ctx";
import { RESIDENT_TABS } from "../app/ledger/ctx";

export const ALWAYS_TABS: Tab[] = ["DETAIL", "NOTICES"];
export const OPTIONAL_TABS: { tab: Tab; name: string; what: string }[] = [
  { tab: "COVER", name: "COVER", what: "Society front page" },
  { tab: "INDEX", name: "INDEX", what: "List of all flats with owner names" },
  { tab: "FLOOR", name: "FLOOR", what: "Floor plans" },
  { tab: "DIRECTORY", name: "DIRECTORY", what: "Members' directory (only flats that agreed to be listed)" },
  { tab: "BUSINESS", name: "BUSINESS", what: "Members' business directory" },
  { tab: "VAULT", name: "VAULT", what: "Society documents" },
  { tab: "EVENTS", name: "EVENTS", what: "Events, photos, registration" },
  { tab: "CONTACTS", name: "CONTACTS", what: "Important phone numbers (lift, fire, security, plumber …)" },
];

/** Tabs a flat login sees. setting = the saved list, or null when nothing is saved yet (then all, as before). */
export function residentTabs(setting: string[] | null | undefined): Tab[] {
  return RESIDENT_TABS.filter((t) => ALWAYS_TABS.includes(t) || !setting || setting.includes(t));
}

/** Tabs a tenant login sees (30 Oct 2026): MY FLAT (tenant screen), NOTICES, CONTACTS and EVENTS, plus COVER when the
 *  committee shows it to members. Never INDEX, FLOOR, DIRECTORY, BUSINESS or VAULT (owners' and members' screens). */
export const TENANT_TABS: Tab[] = ["COVER", "DETAIL", "NOTICES", "CONTACTS", "EVENTS"];
export function tenantTabs(setting: string[] | null | undefined): Tab[] {
  return TENANT_TABS.filter((t) => ALWAYS_TABS.includes(t) || !setting || setting.includes(t));
}

/** Keeps only known optional tabs, in a fixed order (what gets saved). */
export function cleanSetting(list: string[]): Tab[] {
  return OPTIONAL_TABS.map((o) => o.tab).filter((t) => list.includes(t));
}
