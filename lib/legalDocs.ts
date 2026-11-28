// The legal documents of GrihSahara, kept in ONE place (Nov 2026). Pure text and types: no Supabase, no Node-only imports, so screens and tests can load it.
//
// How it works
//   * The words of every document live here, one entry per (key, version). A document that has been PUBLISHED is never edited: a change is a NEW version
//     (same key, version + 1) and members are asked to accept it again (later PRs). Drafts may still be edited.
//   * The database holds a small registry of these documents (table legal_documents: key, version, status, audience, SHA-256 of the text) and the
//     acceptance records (table legal_acceptances: society, login, key, version, hash, time). The registry rows are made from this file by
//     `npx tsx scripts/legalSeed.ts` (see legal/README.md); tests/legalDocs.test.ts fails if legal/LG_02_DOCS_SEED.sql is out of date.
//   * {{society}} stands for the society's name and {{platform}} for GrihSahara. The hash is taken over the text WITH these placeholders, so one
//     hash proves the wording for every society.
//   * These documents are general plain-language texts written with the DPDP Act, 2023 and the DPDP Rules, 2025 in mind. They do not promise
//     compliance, and they are not legal advice: a lawyer should check them before they are published.
export type LegalSection = { title: string; paras?: string[]; bullets?: string[] };
export type LegalStatus = "draft" | "published" | "retired";
/** Who the document is for: the roles of society_memberships (society_admin = the society owner). */
export type LegalAudience = "society_admin" | "committee" | "flat" | "tenant";
export type LegalDoc = {
  key: string; version: number; status: LegalStatus; title: string;
  audience: LegalAudience[];
  /** When it must be accepted: at a login's first sign-in, or when the society is set up (later PRs use this). */
  requiredAt: "first_login" | "onboarding";
  /** Who the two sides are, in plain words (shown above the text). */
  between: string;
  sections: LegalSection[];
};

export const PLATFORM_NAME = "GrihSahara";
export const ALL_LOGINS: LegalAudience[] = ["society_admin", "committee", "flat", "tenant"];

export const SOCIETY_PRIVACY_NOTICE_V1: LegalDoc = {
  key: "society-privacy-notice", version: 1, status: "draft", title: "Society Privacy Notice",
  audience: ALL_LOGINS, requiredAt: "first_login",
  between: "From {{society}} (the Society) to everyone who uses the app.",
  sections: [
    { title: "1. About this notice", paras: [
      "{{society}} (the Society) runs its work through the {{platform}} app. This notice explains what personal information the Society collects in the app, why, who can see it and what choices and rights you have.",
      "It is written with the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025 in mind. It is a plain-language summary and does not promise that every legal requirement is met." ] },
    { title: "2. Who is responsible", paras: [
      "The Society, through its managing committee, decides why and how your information is used. Under the Act it is the Data Fiduciary.",
      "{{platform}} provides the software and the technical infrastructure on the Society's behalf. It does not use the Society's records for its own purposes and does not routinely open or browse them." ] },
    { title: "3. What the Society collects", bullets: [
      "Flat details: owner and tenant name, mobile number, email, address, tenancy dates and membership details.",
      "Family members: name, relation, mobile number, optional date of birth, vehicles and emergency contacts.",
      "Bills, receipts, payment reports and, if you upload one, a payment screenshot (an AI service reads the amount and reference; the committee still checks it).",
      "Complaints, letter requests, bookings, event registrations, nominee forms and documents you upload.",
      "Login and access records: who opened or changed what, and when." ] },
    { title: "4. Why it is used", paras: ["Only for the Society's own work:"], bullets: [
      "running the Society and its accounts, and sending bills, notices and messages;",
      "handling complaints, bookings, letters and events;",
      "safety, security and emergency contact;",
      "keeping the records the Society needs for its accounts and legal duties.",
      "Your information is not sold and is not used for advertising." ] },
    { title: "5. Who can see it", bullets: [
      "Your own flat.",
      "The committee, only as far as each person's role needs.",
      "Other members see only your flat number and the owner's or tenant's name. Family details are private by default (see section 6).",
      "A tenant login sees only the screens opened for tenants, and not the owner's bills.",
      "Service providers that run the app for the Society: Supabase (database and logins), Cloudflare (file storage and the AI that reads payment screenshots) and Vercel (web hosting)." ] },
    { title: "6. Family details and sharing", paras: [
      "Family details are private by default. They are shown to other registered members only if the person concerned agrees, separately and by choice.",
      "One family member cannot agree for another adult. A parent or legal guardian may decide for a child under 18, and the app does not track children or show them advertising.",
      "You can change or withdraw a sharing choice at any time, as easily as you gave it." ] },
    { title: "7. Your rights", bullets: [
      "To know what personal information the Society holds about you and how it is used.",
      "To have wrong or incomplete information corrected or updated.",
      "To ask for your information to be erased when it is no longer needed, except records the Society must keep.",
      "To have a complaint about your information looked into.",
      "To name another person to act for you if you cannot, for example because of illness or death.",
      "To use a right, tell the Secretary or the committee in writing or through a complaint in the app." ] },
    { title: "8. Keeping information safe", paras: [
      "Each society's information is kept separate from every other society's. Access depends on the login, files open only through short-lived secure links, the Society can take backups, and an access log records sensitive actions. No system is perfectly secure, so please keep your password private.",
      "If personal information is exposed or misused, the Society will inform the people affected and the Data Protection Board of India as the law requires." ] },
    { title: "9. How long it is kept", paras: ["Information is kept while it is needed for the Society's work and records, and as the law requires. When it is no longer needed it is deleted or made anonymous, unless the law requires it to be kept."] },
    { title: "10. Questions and complaints", paras: [
      "Contact the Secretary or the committee through the app or at the Society office. If your complaint is not resolved, you may approach the Data Protection Board of India." ] },
    { title: "11. Changes", paras: ["When this notice changes, a new version is published and you will be asked to read and accept it again."] },
  ],
};

export const APPLICATION_TERMS_V1: LegalDoc = {
  key: "application-terms", version: 1, status: "draft", title: "Application Terms",
  audience: ALL_LOGINS, requiredAt: "first_login",
  between: "Between {{society}} (the Society) and each person who uses the app.",
  sections: [
    { title: "1. Who may use the app", paras: ["The app is for the members and tenants of {{society}} and its committee. The committee creates each login for one flat or one person. Use only your own login."] },
    { title: "2. Your login", paras: ["Keep your password private and share it only within your own family. Tell the committee if you think someone else knows it. What is done with your login is treated as done by you."] },
    { title: "3. Correct information", paras: ["Give true and current information and update it when it changes. Enter another person's details only if you are allowed to."] },
    { title: "4. Other people's information", paras: ["Do not copy, forward or publish the directory, birthdays or any other person's details outside the Society. Do not enter an adult family member's details for sharing with other members unless that person has agreed."] },
    { title: "5. Using the app properly", bullets: ["Do not misuse the app, try to open information that is not yours or disturb how it works.", "Do not upload anything unlawful, offensive or that you have no right to share."] },
    { title: "6. Bills and payments", paras: ["Bills, receipts and balances in the app are the Society's records. The app does not itself move money: you pay as the bill says and the committee confirms the payment. Raise any difference with the committee."] },
    { title: "7. Privacy", paras: ["The Society Privacy Notice explains what information is collected and your rights. You are asked to accept it together with these terms."] },
    { title: "8. Availability", paras: ["The app is provided as it is and may be unavailable at times."] },
    { title: "9. Suspending access", paras: ["The committee may suspend or remove a login that is misused, or when a person is no longer a member or tenant, in line with the Society's bye-laws."] },
    { title: "10. Law and contact", paras: ["Indian law applies, together with the Society's bye-laws. For any question about these terms, contact the Secretary or the committee."] },
  ],
};

/** Every document and version, oldest first. A new version of a document is added here, never edited in place once published. */
export const LEGAL_DOCS: LegalDoc[] = [SOCIETY_PRIVACY_NOTICE_V1, APPLICATION_TERMS_V1];

/** The document texts with {{society}} / {{platform}} filled in. With no society name: "your housing society". */
export function renderText(text: string, society?: string | null): string {
  const s = society && society.trim() ? society.trim() : "your housing society";
  return text.replace(/\{\{society\}\}/g, s).replace(/\{\{platform\}\}/g, PLATFORM_NAME);
}
export function renderDoc(doc: LegalDoc, society?: string | null): LegalDoc {
  const r = (t: string) => renderText(t, society);
  return { ...doc, between: r(doc.between), sections: doc.sections.map((s) => ({ title: r(s.title), paras: s.paras?.map(r), bullets: s.bullets?.map(r) })) };
}
/** The latest PUBLISHED version of a document, or undefined. */
export function latestPublished(key: string, docs: LegalDoc[] = LEGAL_DOCS): LegalDoc | undefined {
  return docs.filter((d) => d.key === key && d.status === "published").sort((a, b) => b.version - a.version)[0];
}
/** The text that is hashed: title, audience-free, with the placeholders left in. One line per part, so a wording change changes the hash. */
export function canonicalText(doc: LegalDoc): string {
  const lines = [doc.title, doc.between];
  for (const s of doc.sections) { lines.push(s.title); (s.paras || []).forEach((p) => lines.push(p)); (s.bullets || []).forEach((b) => lines.push("- " + b)); }
  return lines.join("\n");
}
