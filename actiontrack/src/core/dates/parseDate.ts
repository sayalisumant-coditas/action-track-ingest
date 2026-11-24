import { isISODate } from './iso.js';
import type { ISODate } from '../types.js';

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const WD =
  '(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const MON = '([a-z]{3,9})';
const DAY_FIRST = new RegExp(
  `^(?:${WD}\\s*,?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?,?\\s+(\\d{4})$`,
  'i',
);
const MONTH_FIRST = new RegExp(
  `^(?:${WD}\\s*,?\\s+)?${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`,
  'i',
);

export interface ParsedDate {
  date: ISODate;
  /** Present when a weekday was written and does not match the date. */
  weekdayMismatch?: { written: string; actual: string };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Weekday of an ISO date as a 3-letter lowercase name (UTC, timezone independent). */
export function weekdayOf(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] as string;
}

/**
 * Absolute dates only: `YYYY-MM-DD`, `[Weekday,] D Month YYYY`, `[Weekday,] Month D, YYYY`.
 * Month names are full or 3-letter (also `Sept`), case-insensitive. Real calendar dates only.
 * Pinned choices: an ISO datetime (`2026-09-01T10:00:00Z`) and a date with no year return null.
 */
export function parseDateTextDetailed(input: string): ParsedDate | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s === '') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isISODate(s) ? { date: s } : null;

  let weekday: string | undefined;
  let day: string | undefined;
  let month: string | undefined;
  let year: string | undefined;
  let m = DAY_FIRST.exec(s);
  if (m) [, weekday, day, month, year] = m;
  else if ((m = MONTH_FIRST.exec(s))) [, weekday, month, day, year] = m;
  else return null;

  const monthNo = MONTHS[(month ?? '').toLowerCase()];
  if (!monthNo || !day || !year) return null;
  const iso = `${year}-${pad(monthNo)}-${pad(Number(day))}`;
  if (!isISODate(iso)) return null;

  const actual = weekdayOf(iso);
  if (weekday && weekday.slice(0, 3).toLowerCase() !== actual) {
    return { date: iso, weekdayMismatch: { written: weekday, actual } };
  }
  return { date: iso };
}

/** Absolute date text to ISO date, or null. See `parseDateTextDetailed` for weekday mismatches. */
export function parseDateText(input: string): ISODate | null {
  return parseDateTextDetailed(input)?.date ?? null;
}

/** Date from a leading `YYYY-MM-DD` in a file name (directory part ignored), or null. */
export function dateFromFileName(name: string): ISODate | null {
  const base = name.split(/[\\/]/).pop() ?? '';
  const m = /^(\d{4}-\d{2}-\d{2})(?=[-_.\s]|$)/.exec(base);
  return m && isISODate(m[1]) ? (m[1] as string) : null;
}
