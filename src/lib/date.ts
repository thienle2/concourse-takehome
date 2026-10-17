// The prototype runs on a fixed date. Nothing in the app reads the real clock.
export const TODAY = '2026-10-12';

const DAY_MS = 86_400_000;

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function addDays(iso: string, n: number): string {
  return new Date(toUTC(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const withYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const long = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Oct 7" */
export const fmtShort = (iso: string) => short.format(toUTC(iso));
/** "Oct 7, 2026" */
export const fmtDate = (iso: string) => withYear.format(toUTC(iso));
/** "Monday, October 12, 2026" */
export const fmtLong = (iso: string) => long.format(toUTC(iso));

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parses "Aug 1, 2026" into "2026-08-01". Returns null when it can't. */
export function parseHumanDate(text: string): string | null {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
