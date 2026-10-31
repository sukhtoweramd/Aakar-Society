// Date of birth instead of age for family members (DOB.sql, 31 Oct 2026). Pure helpers (no database), safe for tests.
// Entering a date of birth means the family agrees to share the BIRTHDAY (day and month only, never the year) with
// all members; the full date is seen only by that flat and the committee.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD that is a real date and not before 1900. */
function realDate(dob: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x = new Date(Date.UTC(y, mo - 1, d));
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== mo - 1 || x.getUTCDate() !== d || y < 1900) return null;
  return x.getTime();
}
/** A real date of birth: not before 1900 and not in the future. */
export function validDob(dob: string | null | undefined, on = new Date()): boolean {
  const t = realDate(dob);
  return t !== null && t <= Date.UTC(on.getFullYear(), on.getMonth(), on.getDate());
}

/** Age in whole years from a date of birth (null when there is none or it is not valid). */
export function ageFromDob(dob: string | null | undefined, on = new Date()): number | null {
  if (!validDob(dob, on)) return null;
  const [y, m, d] = (dob as string).split("-").map(Number);
  let a = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) a--;
  return a;
}

/** The age to show: worked out from the date of birth, else the old typed age (kept until a date of birth is entered). */
export const ageOf = (m: { dob?: string | null; age?: number | null }, on = new Date()): number | null => ageFromDob(m.dob, on) ?? m.age ?? null;

/** "14 Mar" from a date of birth, or from day and month (as the member directory gives them). Never the year. */
export function birthdayText(dobOrDay: string | number | null | undefined, month?: number | null): string {
  if (typeof dobOrDay === "number") return month && month >= 1 && month <= 12 && dobOrDay >= 1 && dobOrDay <= 31 ? `${dobOrDay} ${MONTHS[month - 1]}` : "";
  if (!dobOrDay || realDate(dobOrDay) === null) return "";
  const [, m, d] = dobOrDay.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Full date for the flat and the committee: "14 Mar 1985". */
export function fullDob(dob: string | null | undefined): string {
  return validDob(dob) ? `${birthdayText(dob)} ${(dob as string).slice(0, 4)}` : "";
}

/** Is the birthday today (India date as YYYY-MM-DD)? 29 Feb is shown on 28 Feb in other years. */
export function isBirthdayOn(dob: string | null | undefined, today: string): boolean {
  if (!validDob(dob)) return false;
  const [, m, d] = (dob as string).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if (m === 2 && d === 29 && !(ty % 4 === 0 && (ty % 100 !== 0 || ty % 400 === 0))) return tm === 2 && td === 28;
  return tm === m && td === d;
}
