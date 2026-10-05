// Date-only values (due dates, start dates) are handled as "YYYY-MM-DD" strings in DTOs.
// Postgres DATE columns arrive from Prisma as UTC-midnight Date objects.

export type ISODate = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;

export function toISODate(d: Date | null | undefined): ISODate | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA timezone. */
export function todayISO(timeZone = "Asia/Kolkata", now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseISODate(s: ISODate): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);
}

export function addDays(d: ISODate, days: number): ISODate {
  return toISODate(new Date(parseISODate(d).getTime() + days * DAY_MS))!;
}

/** Monday-based start of week. */
export function startOfWeek(d: ISODate): ISODate {
  const dow = parseISODate(d).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function startOfNextMonth(d: ISODate): ISODate {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
