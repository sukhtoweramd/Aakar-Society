// Society owner checklist (27 Nov 2026): the first things a new society sets up, in a sensible order.
// Pure: it only turns facts (counts read through the owner's own login) into steps. No database or screen code here.
export type ChecklistFacts = {
  profileFilled: boolean;       // name, full name, address and registration are not empty
  towers: number;
  flats: number;
  flatsWithOwner: number;       // flats whose owner name is filled
  committeeFlats: number;       // flats marked on the committee
  flatsWithRate: number;        // flats whose maintenance amount is above 0
  payDetails: boolean;          // bank account or UPI id saved in BILLING settings
  signatories: number;          // active signatories
  notices: number;
  live: boolean;                // GO LIVE was pressed
  lastBackupDays?: number | null; // days since the newest saved backup; null = none yet; undefined = this login cannot see the list (step stays advice only)
};
export const BACKUP_FRESH_DAYS = 30;
// Where a step opens when tapped: a tab, optionally a sub-view of it, or (on ADMIN) one of its sections (lib/adminSections.ts). Opening a step NEVER marks it done.
export type Target = { tab: string; view?: string; section?: string };
export type StepKey = "profile" | "towers" | "flats" | "rates" | "owners" | "committee" | "paydetails" | "signers" | "notice" | "backup" | "live";
export type Step = { key: StepKey; title: string; hint: string; where: string; done: boolean; manual?: boolean; detail?: string; target: Target };

export const EMPTY_FACTS: ChecklistFacts = { profileFilled: false, towers: 0, flats: 0, flatsWithOwner: 0, committeeFlats: 0, flatsWithRate: 0, payDetails: false, signatories: 0, notices: 0, live: false };

export function checklistSteps(f: ChecklistFacts): Step[] {
  const some = f.flats > 0;
  const tracked = f.lastBackupDays !== undefined;
  return [
    { key: "profile", title: "Society details", hint: "Name, full name, address, registration number and logo appear on every printed paper.", where: "ADMIN → FLAT SETUP → SOCIETY", done: f.profileFilled, target: { tab: "ADMIN", section: "FLATSETUP" } },
    { key: "towers", title: "Towers", hint: "Add each tower or wing with its letter.", where: "ADMIN → FLAT SETUP → TOWERS", done: f.towers > 0, detail: f.towers ? `${f.towers} tower${f.towers === 1 ? "" : "s"}` : undefined, target: { tab: "ADMIN", section: "FLATSETUP" } },
    { key: "flats", title: "Flats", hint: "Create the flats tower by tower. This can be done only while a tower has no flats.", where: "ADMIN → FLAT SETUP → FLOORS & FLATS", done: some, detail: some ? `${f.flats} flats` : undefined, target: { tab: "ADMIN", section: "FLATSETUP" } },
    { key: "rates", title: "Maintenance rates", hint: "Set the maintenance amount for each flat before the first bill run.", where: "ADMIN → rates table", done: some && f.flatsWithRate === f.flats, detail: some ? `${f.flatsWithRate} of ${f.flats} flats have a rate` : undefined, target: { tab: "ADMIN", section: "RATES" } },
    { key: "owners", title: "Owners", hint: "Owner names and mobile numbers, flat by flat (members can also fill their own).", where: "MY FLAT / DETAIL", done: some && f.flatsWithOwner === f.flats, detail: some ? `${f.flatsWithOwner} of ${f.flats} flats have an owner` : undefined, target: { tab: "DETAIL" } },
    { key: "committee", title: "Committee", hint: "Mark the committee flats with their designations; create committee logins for the Chairman and Secretaries only.", where: "ADMIN → COMMITTEE", done: f.committeeFlats > 0, detail: f.committeeFlats ? `${f.committeeFlats} committee flat${f.committeeFlats === 1 ? "" : "s"}` : undefined, target: { tab: "ADMIN", section: "COMMITTEE" } },
    { key: "paydetails", title: "Payment details", hint: "Bank account and UPI id that print on bills.", where: "BILLING → SETTINGS", done: f.payDetails, target: { tab: "BILLING", view: "SETTINGS" } },
    { key: "signers", title: "Signatories", hint: "Who signs bills, receipts and letters.", where: "BILLING → SETTINGS", done: f.signatories > 0, detail: f.signatories ? `${f.signatories} active` : undefined, target: { tab: "BILLING", view: "SETTINGS" } },
    { key: "notice", title: "First notice", hint: "Tell members the app is ready and how to log in.", where: "NOTICES", done: f.notices > 0, target: { tab: "NOTICES" } },
    { key: "backup", title: "Take a backup", hint: "Download a full copy of the society's records (a copy is also kept in storage). Do it before big changes and at least once a month.", where: "ADMIN → BACKUP", done: tracked && f.lastBackupDays != null && f.lastBackupDays <= BACKUP_FRESH_DAYS, manual: !tracked, detail: !tracked ? undefined : f.lastBackupDays == null ? "no backup saved yet" : f.lastBackupDays === 0 ? "last backup today" : `last backup ${f.lastBackupDays} day${f.lastBackupDays === 1 ? "" : "s"} ago`, target: { tab: "ADMIN", section: "BACKUP" } },
    { key: "live", title: "Go live", hint: "Clears the test bills, receipts and letters and locks that for ever. Do it last, once real work starts.", where: "ADMIN → TEST DATA → GO LIVE", done: f.live, target: { tab: "ADMIN", section: "TEST" } },
  ];
}

/** done = steps the app can see are finished; total excludes steps it cannot see (backup, for a login that cannot read the backup list). */
export function checklistProgress(steps: Step[]): { done: number; total: number; next: Step | null; complete: boolean } {
  const counted = steps.filter((s) => !s.manual);
  const done = counted.filter((s) => s.done).length;
  const next = steps.find((s) => !s.manual && !s.done) || null;
  return { done, total: counted.length, next, complete: done === counted.length };
}

/** Pure reading of rows into facts (the screen passes what it read). */
export function factsFrom(x: {
  profile: { name?: string; full?: string; address?: string; reg?: string };
  towers: number;
  flats: { owner_name?: string | null; is_committee?: boolean | null; maintenance?: number | null }[];
  settings: { account_no?: string | null; upi_id?: string | null } | null;
  signatories: number; notices: number; live: boolean; lastBackupDays?: number | null;
}): ChecklistFacts {
  const t = (v: unknown) => String(v ?? "").trim().length > 0;
  const p = x.profile;
  return {
    profileFilled: t(p.name) && t(p.full) && t(p.address) && t(p.reg),
    towers: x.towers,
    flats: x.flats.length,
    flatsWithOwner: x.flats.filter((f) => t(f.owner_name)).length,
    committeeFlats: x.flats.filter((f) => f.is_committee).length,
    flatsWithRate: x.flats.filter((f) => Number(f.maintenance) > 0).length,
    payDetails: !!x.settings && (t(x.settings.account_no) || t(x.settings.upi_id)),
    signatories: x.signatories, notices: x.notices, live: x.live, lastBackupDays: x.lastBackupDays,
  };
}
