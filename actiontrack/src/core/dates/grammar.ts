import { weekdayNumber } from './weekday.js';

/**
 * The single grammar for due phrases. `isDatePhrase` and `resolveDue` both use `matchPhrase`, so
 * they can never disagree about what counts as a date.
 */

export const MONTH_NUMBERS: Record<string, number> = {
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
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export const monthNumber = (s: string): number | null =>
  MONTH_NUMBERS[s.toLowerCase().replace(/\.$/, '')] ?? null;

const WD =
  '(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const MON = `(?:${Object.keys(MONTH_NUMBERS)
  .sort((a, b) => b.length - a.length)
  .join('|')})`;
const ORD = '(?:st|nd|rd|th)?';

export type Phrase =
  | { rule: 'iso'; iso: string }
  | { rule: 'absolute'; weekday?: number; day: number; month: number; year?: number }
  | { rule: 'tomorrow' }
  | { rule: 'today' }
  | { rule: 'next-weekday'; weekday: number }
  | { rule: 'weekday'; weekday: number }
  | { rule: 'end-of-next-week' }
  | { rule: 'end-of-month' }
  | { rule: 'end-of-named-month'; month: number }
  | { rule: 'mid-month'; month: number };

/** Lowercase, collapse spaces, drop trailing punctuation, strip leading `by on due before until`. */
export function normalisePhrase(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  s = s.replace(/[.,;:!?]+$/, '');
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^(?:by|on|due|before|until)\s+/, '');
  } while (s !== prev);
  return s;
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));

/** Rules, most specific first. Each regex is anchored on the normalised phrase. */
const RULES: { re: RegExp; build: (m: RegExpExecArray) => Phrase | null }[] = [
  { re: /^(\d{4}-\d{2}-\d{2})$/, build: (m) => ({ rule: 'iso', iso: m[1] as string }) },
  {
    // [Weekday[,]] D[st] [of] Mon[.] [[,] YYYY]
    re: new RegExp(
      `^(?:(${WD})\\.?,?\\s+)?(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MON})\\.?(?:,?\\s+(\\d{4}))?$`,
    ),
    build: (m) => ({
      rule: 'absolute',
      weekday: m[1] ? (weekdayNumber(m[1]) ?? undefined) : undefined,
      day: Number(m[2]),
      month: monthNumber(m[3] as string) as number,
      year: num(m[4]),
    }),
  },
  {
    // [Weekday[,]] Mon[.] D[st] [[,] YYYY]
    re: new RegExp(`^(?:(${WD})\\.?,?\\s+)?(${MON})\\.?\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?$`),
    build: (m) => ({
      rule: 'absolute',
      weekday: m[1] ? (weekdayNumber(m[1]) ?? undefined) : undefined,
      day: Number(m[3]),
      month: monthNumber(m[2] as string) as number,
      year: num(m[4]),
    }),
  },
  { re: /^(?:(?:eod|end of day)\s+)?tomorrow$/, build: () => ({ rule: 'tomorrow' }) },
  { re: /^(?:eod|today|end of day)$/, build: () => ({ rule: 'today' }) },
  {
    re: new RegExp(`^next\\s+(${WD})\\.?$`),
    build: (m) => ({ rule: 'next-weekday', weekday: weekdayNumber(m[1] as string) as number }),
  },
  {
    re: new RegExp(`^(${WD})$`),
    build: (m) => ({ rule: 'weekday', weekday: weekdayNumber(m[1] as string) as number }),
  },
  {
    re: /^(?:the\s+)?end of (?:the\s+)?next week$/,
    build: () => ({ rule: 'end-of-next-week' }),
  },
  {
    re: /^(?:the\s+)?end of (?:the\s+)?month$/,
    build: () => ({ rule: 'end-of-month' }),
  },
  {
    re: new RegExp(`^(?:the\\s+)?end of (${MON})$`),
    build: (m) => ({ rule: 'end-of-named-month', month: monthNumber(m[1] as string) as number }),
  },
  {
    re: new RegExp(`^mid[-\\s]?(${MON})$`),
    build: (m) => ({ rule: 'mid-month', month: monthNumber(m[1] as string) as number }),
  },
];

/** Match an already-normalised phrase against the grammar. */
export function matchPhrase(normalised: string): Phrase | null {
  for (const { re, build } of RULES) {
    const m = re.exec(normalised);
    if (m) {
      const p = build(m);
      if (p) return p;
    }
  }
  return null;
}

/** True if the text (with or without a leading `by`/`on`/`due`…) is a date phrase of the grammar. */
export function isDatePhrase(s: string): boolean {
  return typeof s === 'string' && s.trim() !== '' && matchPhrase(normalisePhrase(s)) !== null;
}
