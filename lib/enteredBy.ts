// "Entered by" for complaints and bookings (PR-16). The database records the email of the login that made each entry
// (`created_by`, set from the login itself, never from a form), so nobody can fake it. Flat logins use an internal address
// (A-502 → a502@flats…, tenant → a502.tenant@flats…); committee logins use their own email.
// Pure helpers: no Supabase import, so the tests can load this file.
import { RESIDENT_DOMAIN } from "./residents";

const prettyFlat = (id: string) => id.toUpperCase().replace(/^([A-Z]+)(\d)/, "$1-$2");

/** What to print after "Entered by". Committee viewers see the committee member's name and email;
 *  members only see that the committee entered it (committee emails stay private). */
export function enteredByLabel(createdBy: string | null | undefined, viewerIsCommittee: boolean, names: Record<string, string> = {}): string {
  const raw = String(createdBy || "").trim();
  if (!raw || raw.toLowerCase() === "unknown") return "Not recorded";
  const email = raw.toLowerCase();
  const at = email.lastIndexOf("@");
  if (at > 0 && email.slice(at + 1) === RESIDENT_DOMAIN) {
    const local = email.slice(0, at);
    return local.endsWith(".tenant") ? `Tenant login ${prettyFlat(local.slice(0, -7))}` : `Flat login ${prettyFlat(local)}`;
  }
  if (!viewerIsCommittee) return "Committee";
  const name = names[email];
  return name ? `Committee: ${name} (${raw})` : `Committee: ${raw}`;
}
