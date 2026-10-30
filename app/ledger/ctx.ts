import type { Category, Flat } from "@/lib/society";

export const TABS = ["COVER", "INDEX", "FLOOR", "DETAIL", "BUSINESS", "DIRECTORY", "VAULT", "NOTICES", "CONTACTS", "EVENTS", "BILLING", "COMMITTEE", "ADMIN", "REPORTS"] as const;
export type Tab = (typeof TABS)[number];
// What a resident (flat login) can open. DETAIL is shown as "MY FLAT".
export const RESIDENT_TABS: Tab[] = ["COVER", "INDEX", "DETAIL", "DIRECTORY", "NOTICES", "CONTACTS", "EVENTS", "BUSINESS", "VAULT", "FLOOR"];

export type Ctx = {
  email: string;
  isCommittee: boolean;
  myFlat: string | null; // resident's flat id, e.g. "A101"
  homeFlat: string | null; // the logged-in person's own flat: resident's flat, or a committee login's linked flat (never a tenant's)
  isTenant?: boolean; // tenant login of a rented flat (TENANT_LOGINS.sql)
  tenantFlat?: string | null; // the rented flat of a tenant login
  flats: Flat[];
  categories: Category[];
  towerFilter: string; // "ALL" or tower letter
  setTowerFilter: (t: string) => void;
  search: string;
  setSearch: (s: string) => void;
  selectedId: string | null;
  selectFlat: (id: string) => void;
  go: (t: Tab) => void;
  reloadFlats: () => Promise<void>;
};
