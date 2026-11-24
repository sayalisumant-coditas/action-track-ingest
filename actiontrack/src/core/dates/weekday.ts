import type { ISODate } from '../types.js';

/**
 * Calendar helpers. Everything is done in UTC on `YYYY-MM-DD` strings, so DST and the machine's
 * timezone can never move a date. Weekdays are numbered Monday = 0 … Sunday = 6 (Mon–Sun weeks).
 */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function fromISO(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

function toISO(ms: number): ISODate {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

const DAY_MS = 86_400_000;

export const addDays = (d: ISODate, n: number): ISODate => toISO(fromISO(d) + n * DAY_MS);

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(d: ISODate): number {
  return (new Date(fromISO(d)).getUTCDay() + 6) % 7;
}

/** Year, month (1–12), day of an ISO date. */
export function parts(d: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = d.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** Build an ISO date; null if it is not a real calendar date (31 Feb, 29 Feb in 2026). */
export function makeDate(year: number, month: number, day: number): ISODate | null {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    year > 9999 ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

const WEEKDAY_NAMES: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  weds: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

/** `mon`, `monday`, `thurs`, `tues`… (any case, optional trailing dot) to 0 (Mon) … 6 (Sun), else null. */
export function weekdayNumber(s: string): number | null {
  const key = s.trim().toLowerCase().replace(/\.$/, '');
  return Object.prototype.hasOwnProperty.call(WEEKDAY_NAMES, key)
    ? (WEEKDAY_NAMES[key] ?? null)
    : null;
}

/** First such weekday strictly after `from`. The same weekday gives +7 (open assumption Q1). */
export function nextWeekday(from: ISODate, wd: number): ISODate {
  const diff = ((wd - weekdayIndex(from) + 6) % 7) + 1; // 1..7
  return addDays(from, diff);
}

/** That weekday in the Mon–Sun calendar week after `from`'s week. */
export function weekdayOfNextWeek(from: ISODate, wd: number): ISODate {
  const mondayOfNextWeek = addDays(from, 7 - weekdayIndex(from));
  return addDays(mondayOfNextWeek, wd);
}

/** Friday of next week. */
export const endOfNextWeek = (from: ISODate): ISODate => weekdayOfNextWeek(from, 4);

/** Last day of the month that `from` (or `{year, month}`) is in. */
export function endOfMonth(from: ISODate | { year: number; month: number }): ISODate {
  const { year, month } = typeof from === 'string' ? parts(from) : from;
  return toISO(Date.UTC(year, month, 0));
}

/** The 15th of a month. */
export const midMonth = (month: number, year: number): ISODate =>
  `${pad(year, 4)}-${pad(month)}-15`;

/** The date six calendar months before `d` (day clamped to the month's length). */
export function sixMonthsBefore(d: ISODate): ISODate {
  const { year, month, day } = parts(d);
  let y = year;
  let m = month - 6;
  if (m < 1) {
    m += 12;
    y -= 1;
  }
  return makeDate(y, m, Math.min(day, parts(endOfMonth({ year: y, month: m })).day)) as ISODate;
}
