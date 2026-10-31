// Who has a birthday today (pure helpers, no database import so tests can use them).
// The member directory carries only day and month, and only for flats that share their family details.
export type BirthdayRow = { flat_id?: string | null; tower?: string | null; member_name?: string | null; birth_day?: number | null; birth_month?: number | null };
export type Birthday = { name: string; tower: string; flat: string };

export const isBirthdayToday = (r: BirthdayRow, d: Date): boolean =>
  !!r.member_name && r.birth_day === d.getDate() && r.birth_month === d.getMonth() + 1;

// 29 Feb birthdays are shown on 28 Feb in years that have no 29 Feb.
const feb29Shift = (r: BirthdayRow, d: Date): boolean => {
  const y = d.getFullYear();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return !leap && d.getMonth() === 1 && d.getDate() === 28 && r.birth_day === 29 && r.birth_month === 2 && !!r.member_name;
};

export function birthdaysToday(rows: BirthdayRow[], d: Date = new Date()): Birthday[] {
  return rows
    .filter((r) => isBirthdayToday(r, d) || feb29Shift(r, d))
    .map((r) => ({ name: (r.member_name || "").trim(), tower: r.tower ? String(r.tower) : "", flat: r.flat_id ? String(r.flat_id) : "" }))
    .filter((b) => b.name)
    .sort((a, b) => a.tower.localeCompare(b.tower) || a.flat.localeCompare(b.flat, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}
