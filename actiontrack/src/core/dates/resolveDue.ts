import { isISODate } from './iso.js';
import { isDatePhrase, matchPhrase, normalisePhrase, type Phrase } from './grammar.js';
import {
  addDays,
  endOfMonth,
  endOfNextWeek,
  makeDate,
  midMonth,
  nextWeekday,
  parts,
  sixMonthsBefore,
  weekdayIndex,
  weekdayOfNextWeek,
} from './weekday.js';
import type { DueRef, ISODate } from '../types.js';
import { WarningCode, type WarningInfo } from '../warnings.js';

export { isDatePhrase };

/** Shown in `actiontrack --help`. */
export const DATE_RULES_HELP = `Due-date rules (resolved against the date of the meeting the item came from):
  1. 2026-09-08                       ISO date, used as written
  2. 10 Sep, Oct 3rd, Wed 16 Sep      day + month (year = meeting year; an earlier date more than 6 months
                                      before the meeting rolls to next year)
  3. tomorrow, EOD tomorrow           meeting date + 1 day
  4. today, EOD, end of day           the meeting date itself
  5. next <weekday>                   that weekday in the calendar week (Mon-Sun) after the meeting's week
  6. <weekday>, by Friday             the next such weekday strictly after the meeting date;
                                      the same weekday as the meeting means +7 days
  7. end of next week                 Friday of next week
     end of (the) month, end of <month>   last day of the month
     mid-<month>                      the 15th
  8. anything else                    no date; the original text is kept and a DUE_UNRESOLVABLE warning is raised
Prefixes by / on / due / before / until are ignored. Dates are never resolved against today's date.`;

export interface ResolveResult {
  due: DueRef;
  warnings: WarningInfo[];
}

const validMeeting = (d: ISODate | null): d is ISODate => d !== null && isISODate(d);

/**
 * Pick the year for a day+month given in text. Explicit year wins. Otherwise the meeting's year,
 * rolling to the next year when the date would be more than 6 months before the meeting.
 */
function withYear(month: number, day: number, meeting: ISODate): ISODate | null {
  const { year } = parts(meeting);
  const floor = sixMonthsBefore(meeting);
  const same = makeDate(year, month, day);
  if (same) {
    if (same >= floor) return same;
    return makeDate(year + 1, month, day);
  }
  // Not a real date this year (e.g. 29 Feb): only a nearby later year can rescue it.
  const next = makeDate(year + 1, month, day);
  return next && next > meeting && next <= addDays(meeting, 183) ? next : null;
}

/**
 * Absolute date text to ISO. With a `year`, uses it for year-less dates (no rollover).
 * Handles ISO, `D Mon[th] [YYYY]`, `Mon[th] D[st/nd/rd/th] [YYYY]`, `Weekday D Mon`. Null otherwise.
 */
export function parseAbsolute(s: string, year: number): ISODate | null {
  const p = matchPhrase(normalisePhrase(s));
  if (!p) return null;
  if (p.rule === 'iso') return isISODate(p.iso) ? p.iso : null;
  if (p.rule === 'absolute') return makeDate(p.year ?? year, p.month, p.day);
  return null;
}

type Outcome =
  | { date: ISODate; dependsOnMeeting: boolean; weekdayMismatch?: boolean }
  | { date: null; reason: 'unresolvable' | 'no-meeting-date' };

const unresolvable: Outcome = { date: null, reason: 'unresolvable' };
const noMeeting: Outcome = { date: null, reason: 'no-meeting-date' };

function evaluate(p: Phrase, meeting: ISODate | null): Outcome {
  switch (p.rule) {
    case 'iso':
      return isISODate(p.iso) ? { date: p.iso, dependsOnMeeting: false } : unresolvable;
    case 'absolute': {
      if (p.year !== undefined) {
        const d = makeDate(p.year, p.month, p.day);
        if (!d) return unresolvable;
        return { date: d, dependsOnMeeting: false, weekdayMismatch: mismatch(p.weekday, d) };
      }
      if (!meeting) return noMeeting;
      const d = withYear(p.month, p.day, meeting);
      if (!d) return unresolvable;
      return { date: d, dependsOnMeeting: true, weekdayMismatch: mismatch(p.weekday, d) };
    }
    default:
      break;
  }

  // Everything below is relative to the meeting date.
  if (!meeting) return noMeeting;
  const rel = (date: ISODate): Outcome => ({ date, dependsOnMeeting: true });
  switch (p.rule) {
    case 'tomorrow':
      return rel(addDays(meeting, 1));
    case 'today':
      return rel(meeting);
    case 'next-weekday':
      return rel(weekdayOfNextWeek(meeting, p.weekday));
    case 'weekday':
      return rel(nextWeekday(meeting, p.weekday));
    case 'end-of-next-week':
      return rel(endOfNextWeek(meeting));
    case 'end-of-month':
      return rel(endOfMonth(meeting));
    case 'end-of-named-month': {
      const y = monthYear(p.month, meeting);
      return rel(endOfMonth({ year: y, month: p.month }));
    }
    case 'mid-month':
      return rel(midMonth(p.month, monthYear(p.month, meeting)));
    default:
      return unresolvable;
  }
}

/** Year for a month-only phrase: meeting year, or next year if that would be >6 months in the past. */
function monthYear(month: number, meeting: ISODate): number {
  const { year } = parts(meeting);
  return midMonth(month, year) < sixMonthsBefore(meeting) ? year + 1 : year;
}

function mismatch(written: number | undefined, date: ISODate): boolean | undefined {
  return written === undefined ? undefined : weekdayIndex(date) !== written;
}

/**
 * Resolve due text against the meeting date, with the warnings a caller should record.
 * Pure: no clock, no I/O, never throws.
 */
export function resolveDueWithWarnings(
  raw: string | null,
  meetingDate: ISODate | null,
  meetingDateInferred: boolean,
): ResolveResult {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { due: { raw: null, date: null, inferred: false }, warnings: [] };
  }
  const meeting = validMeeting(meetingDate) ? meetingDate : null;
  const phrase = matchPhrase(normalisePhrase(raw));
  const out: Outcome = phrase ? evaluate(phrase, meeting) : unresolvable;

  if (out.date === null) {
    const why =
      out.reason === 'no-meeting-date'
        ? `cannot resolve "${raw}": the meeting has no date`
        : `cannot read "${raw}" as a date`;
    return {
      due: { raw, date: null, inferred: false, reason: out.reason },
      warnings: [{ code: WarningCode.DUE_UNRESOLVABLE, message: why }],
    };
  }

  const due: DueRef = {
    raw,
    date: out.date,
    inferred: meetingDateInferred && out.dependsOnMeeting,
  };
  const warnings: WarningInfo[] = [];
  if (out.weekdayMismatch) {
    due.reason = 'weekday-mismatch';
    warnings.push({
      code: WarningCode.DUE_WEEKDAY_MISMATCH,
      message: `"${raw}": the weekday does not match ${out.date}; keeping the written date`,
    });
  }
  return { due, warnings };
}

/** `DueRef` for due text, relative to the meeting date. See `DATE_RULES_HELP` for the rules. */
export function resolveDue(
  raw: string | null,
  meetingDate: ISODate | null,
  inferred: boolean,
): DueRef {
  return resolveDueWithWarnings(raw, meetingDate, inferred).due;
}
