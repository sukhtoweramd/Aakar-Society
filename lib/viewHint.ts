// One-shot hint "open this sub-view when that tab next opens" (used by the society checklist: BILLING -> SETTINGS).
// The tab reads it once when it opens; a hint for another tab is ignored. Only changes what is shown, never data.
let hint: { tab: string; view: string } | null = null;
export const setViewHint = (tab: string, view: string) => { hint = { tab, view }; };
export const takeViewHint = (tab: string): string | null => { const h = hint; if (h && h.tab === tab) { hint = null; return h.view; } return null; };
