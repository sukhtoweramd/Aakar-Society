// ADMIN is a menu of tiles; each tile opens ONE section (27 Nov 2026). Pure: the list and its order live here, the screen is app/ledger/AdminTab.tsx.
export type AdminSection = "CHECKLIST" | "FLATSETUP" | "RATES" | "BOOKING" | "COMMITTEE" | "LOGINS" | "SCREENS" | "BACKUP" | "TEST" | "AI" | "HELP" | "STORAGE";
export type SectionInfo = { key: AdminSection; title: string; desc: string; icon: string };

export const ADMIN_SECTIONS: SectionInfo[] = [
  { key: "CHECKLIST", title: "Society checklist", desc: "First setup steps and progress", icon: "✓" },
  { key: "FLATSETUP", title: "Flat setup", desc: "Society details, logo, towers, flats", icon: "🏢" },
  { key: "RATES", title: "Charges & rates", desc: "Maintenance amount per flat category", icon: "₹" },
  { key: "BOOKING", title: "Common areas", desc: "Areas members can book", icon: "📅" },
  { key: "COMMITTEE", title: "Committee logins", desc: "Add, link, reset or remove", icon: "🔑" },
  { key: "LOGINS", title: "Resident logins", desc: "Flat and tenant logins", icon: "👥" },
  { key: "SCREENS", title: "Member screens", desc: "What members can open", icon: "📱" },
  { key: "BACKUP", title: "Backup & restore", desc: "Download, restore, access log", icon: "💾" },
  { key: "TEST", title: "Test data & go live", desc: "Clear test papers, GO LIVE", icon: "🚀" },
  { key: "AI", title: "Screenshot reading", desc: "AI reads \"I have paid\" pictures", icon: "🤖" },
  { key: "HELP", title: "Help guide", desc: "Text the HELP assistant answers from", icon: "❓" },
  { key: "STORAGE", title: "Storage used", desc: "Files and database size", icon: "🗄" },
];

export const isAdminSection = (s: unknown): s is AdminSection => ADMIN_SECTIONS.some((x) => x.key === s);
export const sectionTitle = (k: AdminSection) => ADMIN_SECTIONS.find((x) => x.key === k)!.title;
