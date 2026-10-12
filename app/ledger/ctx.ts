import type { Category, Flat } from "@/lib/society";

export const TABS = ["COVER", "INDEX", "FLOOR", "DETAIL", "BUSINESS", "VAULT", "NOTICES", "EVENTS", "ADMIN", "REPORTS"] as const;
export type Tab = (typeof TABS)[number];

export type Ctx = {
  email: string;
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
