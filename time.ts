import type { Weekday } from './schema.js';

const DAYS: Weekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** Parses YYYY-MM-DD as a calendar date with no timezone involvement. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function weekdayOf(iso: string): Weekday {
  // 1970-01-01 (day 0) was a Thursday.
  const idx = (((dayNumber(iso) + 4) % 7) + 7) % 7;
  return DAYS[idx]!;
}

export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/**
 * Identifies the scheduling week a date falls in, given the day the league's
 * week starts on. Returns the ISO date of that week's first day, so two dates
 * in the same week always produce the same key.
 */
export function weekKey(iso: string, startsOn: Weekday): string {
  const start = DAYS.indexOf(startsOn);
  const cur = DAYS.indexOf(weekdayOf(iso));
  const back = (((cur - start) % 7) + 7) % 7;
  const d = new Date((dayNumber(iso) - back) * 86400000);
  return d.toISOString().slice(0, 10);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export type TimeBand = 'morning' | 'midday' | 'evening';

export function bandOf(
  hhmm: string,
  bands: { morningBefore: string; eveningFrom: string },
): TimeBand {
  const t = minutesOf(hhmm);
  if (t < minutesOf(bands.morningBefore)) return 'morning';
  if (t < minutesOf(bands.eveningFrom)) return 'midday';
  return 'evening';
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                    'August', 'September', 'October', 'November', 'December'];
const DAY_LONG: Record<Weekday, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
};

/**
 * Dates as people read them. One implementation, used by the console, the
 * public page and the CSV writers alike — two of these drifting apart is how
 * a schedule ends up saying two different things.
 */
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-') as [string, string, string];
  return `${MONTH_SHORT[+m - 1]} ${+d}`;
}
export function fmtDateYear(iso: string): string {
  return `${fmtDate(iso)}, ${iso.slice(0, 4)}`;
}
/** Three-letter weekday, capitalised: "Sat". */
export function fmtDay(iso: string): string {
  return DAY_LONG[weekdayOf(iso)].slice(0, 3);
}
/** "Saturday 5 December 2026", for a page families read. */
export function fmtLongDate(iso: string): string {
  const [y, m, d] = iso.split('-') as [string, string, string];
  return `${DAY_LONG[weekdayOf(iso)]} ${+d} ${MONTH_LONG[+m - 1]} ${y}`;
}
export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** "Friday, Saturday and Sunday" */
export function listDays(days: readonly string[]): string {
  const d = days.map(titleCase);
  if (d.length <= 1) return d[0] ?? '';
  return `${d.slice(0, -1).join(', ')} and ${d.at(-1)}`;
}
