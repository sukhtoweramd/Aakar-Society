// Terms of use and privacy notice (DPDP Act, 2023) shown in the app: ADMIN -> TERMS & PRIVACY (society owner) and the public page /legal (linked from the login pages).
// Pure text, no Supabase import. The society's name comes in as an argument (never typed here); with none it says "your housing society".
// This is a general plain-language notice, NOT legal advice: the society owner should have it checked by a lawyer (the owner panel says so).
export type LegalSection = { title: string; paras?: string[]; bullets?: string[] };

export const LEGAL_UPDATED = "27 November 2026";
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const who = (society?: string | null) => (society && society.trim() ? society.trim() : "your housing society");

export function privacySections(society?: string | null): LegalSection[] {
  const s = who(society);
  return [
    { title: "1. Who is responsible for your data",
      paras: [`${cap(s)} (through its managing committee) decides why and how the personal data in this app is used. Under the Digital Personal Data Protection Act, 2023 (DPDP Act) it is the "Data Fiduciary" for that data.`,
        "GrihSahara is the software the society uses. It stores and shows the data on the society's behalf and does not use it for anything else."] },
    { title: "2. What we collect and why",
      bullets: [
        "Flat details: owner and tenant name, mobile, email, address, tenancy dates, share and membership details. Purpose: to run the society, send bills and notices and reach members.",
        "Family members (name, relation, mobile, optional date of birth), vehicles and emergency contacts. Purpose: society records, safety and the member directory.",
        "Bills, receipts, payment reports and the screenshot of a payment, if you upload one. An AI service reads the amount and reference from the picture; the committee still verifies it. Purpose: maintenance accounts.",
        "Complaints, letter requests, common-area bookings, event registrations, nominee forms and documents you upload. Purpose: to give you those services.",
        "Login and access records (who opened or changed what). Purpose: security and accountability.",
      ] },
    { title: "3. Your consent and how to withdraw it",
      paras: ["Members' and tenants' details are shared with other members only with their consent. Family and business details stay private until the flat switches sharing on, and a date of birth is shared (day and month only) only when it is entered. You can change or withdraw your consent at any time; if you cannot, ask the committee.",
        "Some records the society needs for its accounts and legal duties stay even after consent is withdrawn."] },
    { title: "4. Who can see your data",
      bullets: [
        "Your own flat (including the family's logins).",
        "The committee, only as far as each person's role needs.",
        "Other members: only your flat number and owner or tenant name, unless you have consented to share more in the directory.",
        "A tenant login sees only the screens opened for tenants; it does not see the owner's bills.",
        "Service providers that run the app for the society: Supabase (database and logins), Cloudflare (file storage and the AI that reads payment screenshots) and Vercel (web hosting). Your data is not sold and is not used for advertising.",
      ] },
    { title: "5. Children",
      paras: ["Details of a person under 18 are entered only by a parent or lawful guardian, who gives consent on the child's behalf. The app does not track children, monitor their behaviour or show them advertising."] },
    { title: "6. Keeping your data safe",
      paras: ["Each society's data is kept apart from every other society's. Access depends on the login, files open only through short-lived secure links, the society can take backups, and an access log records sensitive actions. No system is perfectly secure, so please keep your password private."] },
    { title: "7. If something goes wrong",
      paras: ["If personal data is exposed or misused, the society will inform the people affected, as the law requires."] },
    { title: "8. How long data is kept",
      paras: ["Data is kept while it is needed for the society's work and records, and as the law requires."] },
    { title: "9. Your rights",
      bullets: [
        "To know what personal data the society holds about you and how it is used.",
        "To have wrong or incomplete data corrected or updated.",
        "To ask for your data to be erased when it is no longer needed (except records the society must keep).",
        "To get your complaint about your data looked into.",
        "To name another person to act for you if you cannot, for example in case of death or illness.",
        "To make a request, tell the Secretary or the committee in writing or through a complaint in the app.",
      ] },
    { title: "10. If you are not satisfied",
      paras: ["If your complaint is not resolved, you may approach the Data Protection Board of India."] },
    { title: "11. Changes",
      paras: [`This notice was last updated on ${LEGAL_UPDATED}. When it changes, the new version replaces this one in the app.`] },
  ];
}

export function termsSections(society?: string | null): LegalSection[] {
  const s = who(society);
  return [
    { title: "1. Who may use the app", paras: [`The app is for the members and tenants of ${s} and its committee. A login is made by the committee for one flat or person; use only your own login.`] },
    { title: "2. Your login", paras: ["Keep your password private and do not share it outside your family. Tell the committee if you think someone else knows it. What is done with your login is treated as done by you."] },
    { title: "3. Correct information", paras: ["Give true and current information. Enter another person's details, a child's or a tenant's, only if you are allowed to. Update the details when they change."] },
    { title: "4. Using it properly", bullets: ["Do not misuse the app, try to open data that is not yours or disturb its working.", "Do not copy, forward or publish the directory, birthdays or other members' details outside the society.", "Do not upload anything unlawful, offensive or that you have no right to share."] },
    { title: "5. Bills and payments", paras: ["Bills, receipts and balances in the app are the society's records. The app does not itself move money: you pay as the bill says, and the committee confirms the payment. Raise any difference with the committee."] },
    { title: "6. Directory and birthdays", paras: ["Family and business details appear in the directory only for flats that agreed. Birthdays show day and month only. See the Privacy Notice for how to change this."] },
    { title: "7. Availability", paras: ["The app is provided as it is and may be unavailable at times."] },
    { title: "8. Suspending access", paras: ["The committee may suspend or remove a login that is misused or when a person is no longer a member or tenant, in line with the society's bye-laws."] },
    { title: "9. Law", paras: ["Indian law applies, together with the society's bye-laws."] },
    { title: "10. Contact", paras: ["For any question about these terms or your data, contact the Secretary or the committee through the app or at the society office."] },
  ];
}

/** Shown only to the society owner (ADMIN panel): what the society should do, with what is confirmed and what is not. */
export const OWNER_DUTIES: { label: "CONFIRMED" | "LIKELY" | "UNKNOWN"; text: string }[] = [
  { label: "CONFIRMED", text: "The DPDP Act, 2023 and the DPDP Rules, 2025 (notified on 14 November 2025) are being phased in over 18 months. The government's own summary says the Rules give an eighteen-month period for phased compliance." },
  { label: "LIKELY", text: "Most duties of a Data Fiduciary (notice, consent, security, breach reporting, children's data, rights) start around 13–14 May 2027. This date comes from independent websites that say to check the Gazette, not from the Gazette itself." },
  { label: "CONFIRMED", text: "Duties named in the official summary: a clear notice of the purpose, reasonable security safeguards, telling affected people about a breach, verifiable parent or guardian consent for a child's data, deleting data when it is no longer needed, and answering rights requests within at most 90 days." },
  { label: "UNKNOWN", text: "Whether a small housing society has any exemption. The sources I read mention none. Ask a lawyer." },
  { label: "UNKNOWN", text: "The exact breach-reporting timeline and the penalty amounts in the Rules, which I could not read in the Rules text itself." },
];

export const OWNER_TODO: string[] = [
  "Name one person (for example the Secretary) as the contact for privacy questions, and tell members who it is.",
  "Decide how long you keep each kind of record (for example members who have left) and write it down.",
  "Enter a child's details, or a date of birth, only with a parent's or the family's agreement.",
  "Answer requests to see, correct or erase data, and note when each was received and answered.",
  "Have a plan for a data leak: who tells members, and who reports to the Data Protection Board.",
  "Get this notice and the terms checked by a lawyer before relying on them. They are a general plain-language draft, not legal advice.",
];

export const OWNER_APP_HELPS = [
  "Directory sharing is off until a flat switches it on, with the date and who agreed recorded.",
  "A date of birth shares only day and month.",
  "Each society's data is walled off; files open by short-lived links; an access log and backups exist.",
];
export const OWNER_APP_GAPS = [
  "No record yet of members accepting these terms (a read-only first version).",
  "No built-in tool yet to export or erase one person's data; the committee does it by hand.",
];
