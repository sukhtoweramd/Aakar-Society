import type { Category, Flat } from "@/lib/society";

export const TABS = ["COVER", "INDEX", "FLOOR", "DETAIL", "BUSINESS", "VAULT", "NOTICES", "EVENTS", "ADMIN", "REPORTS"] as const;
export type Tab = (typeof TABS)[number];
// What a resident (flat login) can open. DETAIL is shown as "MY FLAT".
export const RESIDENT_TABS: Tab[] = ["COVER", "INDEX", "DETAIL", "NOTICES", "EVENTS", "BUSINESS", "VAULT", "FLOOR"];

export type Ctx = {
  email: string;
  isCommittee: boolean;
  myFlat: string | null; // resident's flat id, e.g. "A101"
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
