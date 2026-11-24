import { describe, expect, it } from 'vitest';
import {
  DATE_RULES_HELP,
  isDatePhrase,
  parseAbsolute,
  resolveDue,
  resolveDueWithWarnings,
} from '../../../src/core/dates/resolveDue.js';
import {
  addDays,
  endOfMonth,
  endOfNextWeek,
  nextWeekday,
  weekdayIndex,
  weekdayNumber,
  weekdayOfNextWeek,
} from '../../../src/core/dates/weekday.js';

const date = (raw: string, meeting: string | null, inferred = false) =>
  resolveDue(raw, meeting, inferred).date;

describe('A. required sample rows', () => {
  it.each([
    ['M6-01', '2026-09-01', 'by Friday', '2026-09-04'],
    ['M6-02', '2026-09-01', 'by Thursday', '2026-09-03'],
    ['M6-03', '2026-09-01', '2026-09-08', '2026-09-08'],
    ['M6-04', '2026-09-03', '10 Sep', '2026-09-10'],
    ['M6-05', '2026-09-03', 'by Monday', '2026-09-07'],
    ['M6-06', '2026-09-03', 'end of next week', '2026-09-11'],
    ['M6-07', '2026-09-08', 'by Wed', '2026-09-09'],
    ['M6-08', '2026-09-10', 'by tomorrow', '2026-09-11'],
    ['M6-09', '2026-09-14', 'Wed 16 Sep', '2026-09-16'],
    ['M6-10', '2026-09-14', 'end of month', '2026-09-30'],
    ['M6-11', '2026-09-18', 'by Mon', '2026-09-21'],
    ['M6-12', '2026-09-21', 'EOD tomorrow', '2026-09-22'],
    ['M6-13', '2026-09-30', 'Oct 3rd', '2026-10-03'],
    ['M6-14', '2026-09-30', '15 October', '2026-10-15'],
    ['M6-15', '2026-09-30', 'mid-October', '2026-10-15'],
    ['M6-16', '2026-09-30', 'by Friday', '2026-10-02'],
    ['M6-17', '2026-09-30', 'tomorrow', '2026-10-01'],
    ['M6-18', '2026-10-05', 'by next Tuesday', '2026-10-13'],
    ['M6-19', '2026-10-09', 'by Monday', '2026-10-12'],
    ['M6-20', '2026-10-09', 'by Friday', '2026-10-16'],
  ])('%s %s + "%s"', (_id, meeting, raw, expected) => {
    const r = resolveDue(raw, meeting, false);
    expect(r).toEqual({ raw, date: expected, inferred: false });
  });

  it('M6-21 inferred meeting date [GAP]', () => {
    expect(resolveDue('by Friday', '2026-10-03', true)).toEqual({
      raw: 'by Friday',
      date: '2026-10-09',
      inferred: true,
    });
  });
  it('M6-22 no meeting date [GAP]', () => {
    expect(resolveDue('by Friday', null, false)).toEqual({
      raw: 'by Friday',
      date: null,
      inferred: false,
      reason: 'no-meeting-date',
    });
  });
  it.each([
    ['M6-23', 'before the next review'],
    ['M6-24', 'by the end of the cutover'],
  ])('%s unresolvable [GAP]', (_id, raw) => {
    const { due, warnings } = resolveDueWithWarnings(raw, '2026-09-14', false);
    expect(due).toEqual({ raw, date: null, inferred: false, reason: 'unresolvable' });
    expect(warnings.map((w) => w.code)).toEqual(['DUE_UNRESOLVABLE']);
  });
});

describe('B. missing and empty input', () => {
  it('M6-30 null raw [GAP]', () => {
    expect(resolveDueWithWarnings(null, '2026-09-14', false)).toEqual({
      due: { raw: null, date: null, inferred: false },
      warnings: [],
    });
  });
  it('M6-31 empty / whitespace raw [GAP]', () => {
    for (const raw of ['', '   ']) {
      expect(resolveDueWithWarnings(raw, '2026-09-14', false)).toEqual({
        due: { raw: null, date: null, inferred: false },
        warnings: [],
      });
    }
  });
  it('M6-32 TBD / n/a / - are unresolvable (pinned), never throw [GAP]', () => {
    for (const raw of ['TBD', 'n/a', '-']) {
      expect(resolveDue(raw, '2026-09-14', false)).toMatchObject({
        date: null,
        reason: 'unresolvable',
      });
    }
  });
  it('M6-33 ISO needs no meeting date [GAP]', () =>
    expect(date('2026-10-09', null)).toBe('2026-10-09'));
  it('M6-34 year-less date with no meeting date [GAP]', () =>
    expect(resolveDue('10 Sep', null, false)).toMatchObject({
      date: null,
      reason: 'no-meeting-date',
    }));
  it('M6-35 relative with no meeting date [GAP]', () => {
    for (const raw of ['tomorrow', 'EOD', 'today']) {
      expect(resolveDue(raw, null, false)).toMatchObject({ reason: 'no-meeting-date' });
    }
  });
  it('M6-36 unreadable with no meeting date is unresolvable, not no-meeting-date [GAP]', () =>
    expect(resolveDue('by the end of the cutover', null, false).reason).toBe('unresolvable'));
  it('M6-37 invalid meeting date string is treated as null [BAD]', () => {
    expect(resolveDue('by Friday', 'not-a-date', false)).toMatchObject({
      date: null,
      reason: 'no-meeting-date',
    });
    expect(resolveDue('by Friday', '2026-02-30', false).reason).toBe('no-meeting-date');
  });
});

describe('C. absolute formats', () => {
  const M = '2026-09-30';
  it.each([
    ['M6-40', '2026-10-09', '2026-10-09'],
    ['M6-41', '10 Sep', '2026-09-10'],
    ['M6-41', '10 September', '2026-09-10'],
    ['M6-41', '10 sep', '2026-09-10'],
    ['M6-42', 'Oct 3', '2026-10-03'],
    ['M6-42', 'Oct 3rd', '2026-10-03'],
    ['M6-42', 'October 3rd', '2026-10-03'],
    ['M6-43', '1st Oct', '2026-10-01'],
    ['M6-43', '2nd Oct', '2026-10-02'],
    ['M6-43', '23rd Oct', '2026-10-23'],
    ['M6-43', '4th Oct', '2026-10-04'],
    ['M6-44', '15 Oct 2026', '2026-10-15'],
    ['M6-51', 'Saturday 10 Oct', '2026-10-10'],
  ])('%s "%s"', (_id, raw, expected) => expect(date(raw, M)).toBe(expected));

  it.each([
    ['M6-45', '31 Sep'],
    ['M6-46', '30 Feb'],
    ['M6-48', '29 Feb'],
    ['M6-52', '2026-10-9'],
  ])('%s "%s" is unresolvable', (_id, raw) =>
    expect(resolveDue(raw, M, false)).toMatchObject({ date: null, reason: 'unresolvable' }),
  );

  it('M6-47 29 Feb in a leap year', () => expect(date('29 Feb', '2028-02-10')).toBe('2028-02-29'));
  it('M6-49 matching weekday, no warning', () => {
    const r = resolveDueWithWarnings('Wed 16 Sep', '2026-09-14', false);
    expect(r.due).toEqual({ raw: 'Wed 16 Sep', date: '2026-09-16', inferred: false });
    expect(r.warnings).toEqual([]);
  });
  it('M6-50 wrong weekday keeps the date and warns', () => {
    const r = resolveDueWithWarnings('Thu 16 Sep', '2026-09-14', false);
    expect(r.due).toMatchObject({ date: '2026-09-16', reason: 'weekday-mismatch' });
    expect(r.warnings.map((w) => w.code)).toEqual(['DUE_WEEKDAY_MISMATCH']);
  });
  it('parseAbsolute with a given year', () => {
    expect(parseAbsolute('10 Sep', 2027)).toBe('2027-09-10');
    expect(parseAbsolute('10 Sep 2026', 2027)).toBe('2026-09-10');
    expect(parseAbsolute('tomorrow', 2026)).toBeNull();
    expect(parseAbsolute('29 Feb', 2026)).toBeNull();
  });
});

describe('D. year rollover and leap years', () => {
  it.each([
    ['M6-60', '2026-12-20', '5 Jan', '2027-01-05'],
    ['M6-61', '2026-12-30', 'by Friday', '2027-01-01'],
    ['M6-62', '2026-12-30', 'end of month', '2026-12-31'],
    ['M6-63', '2026-12-30', 'tomorrow', '2026-12-31'],
    ['M6-64', '2026-12-31', 'tomorrow', '2027-01-01'],
    ['M6-65', '2026-12-30', 'end of next week', '2027-01-08'],
    ['M6-66', '2026-09-30', '10 Sep', '2026-09-10'],
    ['M6-67', '2026-09-30', '1 Jan', '2027-01-01'],
    ['M6-68', '2026-01-05', '20 Dec', '2026-12-20'],
    ['M6-69', '2024-02-28', 'tomorrow', '2024-02-29'],
    ['M6-70', '2024-02-29', 'tomorrow', '2024-03-01'],
    ['M6-71', '2026-02-28', 'tomorrow', '2026-03-01'],
    ['M6-72', '2028-02-10', 'end of month', '2028-02-29'],
    ['M6-73', '2026-02-10', 'end of month', '2026-02-28'],
  ])('%s %s + "%s"', (_id, meeting, raw, expected) => expect(date(raw, meeting)).toBe(expected));
});

describe('E. weekday rules', () => {
  it('M6-81 each weekday of one week, same weekday is +7', () => {
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    names.forEach((name, i) => {
      const meeting = addDays('2026-10-05', i); // Mon 5 Oct … Sun 11 Oct
      expect(date(name, meeting), name).toBe(addDays(meeting, 7));
    });
  });
  it('M6-82 Wed + Thursday is the next day', () =>
    expect(date('Thursday', '2026-09-02')).toBe('2026-09-03'));
  it('M6-83 Fri + Thursday is +6', () => expect(date('Thursday', '2026-09-04')).toBe('2026-09-10'));
  it('M6-84 Thu spellings', () => {
    for (const w of ['Thurs', 'Thur', 'Thu']) expect(date(w, '2026-09-01'), w).toBe('2026-09-03');
  });
  it('M6-85 Tue spellings', () => {
    for (const w of ['Tues', 'Tue']) expect(date(w, '2026-09-03'), w).toBe('2026-09-08');
  });
  it('M6-86 Wed spellings and case', () => {
    for (const w of ['Wed.', 'wednesday', 'WEDNESDAY'])
      expect(date(w, '2026-09-01'), w).toBe('2026-09-02');
  });
  it('M6-87 next Tuesday from Mon', () =>
    expect(date('next Tuesday', '2026-10-05')).toBe('2026-10-13'));
  it('M6-88 next Tuesday from Sat: Tuesday of the following Mon-Sun week', () =>
    // tests.md says 2026-10-13, but 3 Oct 2026 is a Saturday in the week 28 Sep-4 Oct, so the
    // following week is 5-11 Oct and its Tuesday is the 6th. The stated rule wins over the typo.
    expect(date('next Tuesday', '2026-10-03')).toBe('2026-10-06'));
  it('M6-89 next Monday from Sun (Sunday ends the week)', () =>
    expect(date('next Monday', '2026-10-04')).toBe('2026-10-05'));
  it('M6-90 next Friday from Mon', () =>
    expect(date('next Friday', '2026-10-05')).toBe('2026-10-16'));
  it('M6-91 Sunday from Sat is the next day', () =>
    expect(date('by Sunday', '2026-10-03')).toBe('2026-10-04'));

  const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  it('M6-92 property: nextWeekday is strictly later and within 7 days', () => {
    const r = rng(1);
    for (let i = 0; i < 1000; i++) {
      const from = addDays('2020-01-01', Math.floor(r() * 3000));
      for (let wd = 0; wd < 7; wd++) {
        const out = nextWeekday(from, wd);
        const gap = (Date.parse(out) - Date.parse(from)) / 86_400_000;
        expect(gap).toBeGreaterThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(7);
        expect(weekdayIndex(out)).toBe(wd);
      }
    }
  });
  it('M6-93 property: weekdayOfNextWeek is 1-13 days later and in the next Mon-Sun week', () => {
    const r = rng(2);
    for (let i = 0; i < 1000; i++) {
      const from = addDays('2020-01-01', Math.floor(r() * 3000));
      const mondayNext = addDays(from, 7 - weekdayIndex(from));
      for (let wd = 0; wd < 7; wd++) {
        const out = weekdayOfNextWeek(from, wd);
        const gap = (Date.parse(out) - Date.parse(from)) / 86_400_000;
        expect(gap).toBeGreaterThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(13);
        expect(out >= mondayNext && out <= addDays(mondayNext, 6)).toBe(true);
        expect(weekdayIndex(out)).toBe(wd);
      }
    }
  });
  it('M6-94 weekdayNumber (Monday = 0 … Sunday = 6)', () => {
    const names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sunday'];
    names.forEach((n, i) => expect(weekdayNumber(n), n).toBe(i));
    expect(weekdayNumber('monday')).toBe(0);
    expect(weekdayNumber('thurs')).toBe(3);
    expect(weekdayNumber('tues')).toBe(1);
    expect(weekdayNumber('xyz')).toBeNull();
    expect(weekdayNumber('constructor')).toBeNull();
  });
  it('helpers: endOfNextWeek / endOfMonth', () => {
    expect(endOfNextWeek('2026-09-03')).toBe('2026-09-11');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});

describe('F. relative phrases', () => {
  it('M6-100 tomorrow variants', () => {
    for (const r of ['tomorrow', 'by tomorrow', 'EOD tomorrow'])
      expect(date(r, '2026-09-10'), r).toBe('2026-09-11');
  });
  it('M6-101 today variants', () => {
    for (const r of ['EOD', 'today', 'end of day', 'by EOD'])
      expect(date(r, '2026-09-10'), r).toBe('2026-09-10');
  });
  it.each([
    ['M6-102', '2026-09-03', '2026-09-11'],
    ['M6-103', '2026-09-05', '2026-09-11'],
    ['M6-104', '2026-09-07', '2026-09-18'],
  ])('%s end of next week from %s', (_id, meeting, expected) =>
    expect(date('end of next week', meeting)).toBe(expected),
  );
  it('M6-105 end of the month', () => {
    for (const r of ['end of the month', 'end of month', 'end of September']) {
      expect(date(r, '2026-09-14'), r).toBe('2026-09-30');
    }
  });
  it('M6-106 end of October', () =>
    expect(date('end of October', '2026-09-14')).toBe('2026-10-31'));
  it('M6-107 mid-October spellings', () => {
    for (const r of ['mid-October', 'mid October', 'Mid-October'])
      expect(date(r, '2026-09-30'), r).toBe('2026-10-15');
  });
  it('M6-108 mid-October already past stays in the same year', () =>
    expect(date('mid-October', '2026-10-20')).toBe('2026-10-15'));
  it('M6-109 not in the grammar [GAP]', () => {
    for (const r of ['by 3pm', 'next quarter', 'ASAP', 'soon', 'when ready']) {
      expect(resolveDue(r, '2026-09-14', false), r).toMatchObject({
        date: null,
        reason: 'unresolvable',
      });
    }
  });
  it('M6-110 end of Q4', () =>
    expect(resolveDue('by the end of Q4', '2026-09-14', false).reason).toBe('unresolvable'));
  it('M6-111 after the cutover', () =>
    expect(resolveDue('after the cutover', '2026-09-14', false).reason).toBe('unresolvable'));
  it('M6-112 by next week is not in the grammar (pinned)', () =>
    expect(resolveDue('by next week', '2026-09-14', false).reason).toBe('unresolvable'));
  it('M6-113 padding, case, trailing dot', () => {
    for (const r of ['by Friday  ', 'BY FRIDAY', 'by friday.']) {
      expect(resolveDue(r, '2026-09-14', false)).toEqual({
        raw: r,
        date: '2026-09-18',
        inferred: false,
      });
    }
  });
});

describe('G. prefixes and grammar', () => {
  it('M6-120 prefixes are equivalent', () => {
    for (const p of ['by ', 'on ', 'due ', 'before ', 'until ', 'due by ', '']) {
      expect(date(`${p}Friday`, '2026-09-14'), p).toBe('2026-09-18');
    }
  });
  it('M6-121 true phrases', () => {
    for (const s of ['Friday', '10 Sep', 'EOD', 'end of next week', 'mid-October'])
      expect(isDatePhrase(s), s).toBe(true);
  });
  it('M6-122 false phrases', () => {
    for (const s of ['the cutover', 'quote', '10%', '']) expect(isDatePhrase(s), s).toBe(false);
  });
  it('M6-123 unresolvable phrases are not grammar', () =>
    expect(isDatePhrase('by the end of the cutover')).toBe(false));
  it('M6-124 weekday + date', () => {
    for (const s of ['Wed 16 Sep', 'Saturday 10 Oct']) expect(isDatePhrase(s), s).toBe(true);
  });
  it('M6-125 word boundaries', () => {
    expect(isDatePhrase('Mon')).toBe(true);
    expect(isDatePhrase('mon')).toBe(true);
    expect(isDatePhrase('Monitor')).toBe(false);
    expect(isDatePhrase('Marching')).toBe(false);
  });
  it('M6-126 grammar and resolver agree over 100+ phrases', () => {
    const cores = [
      'friday',
      'mon',
      'next tuesday',
      'tomorrow',
      'eod',
      'today',
      'end of day',
      'end of next week',
      'end of month',
      'end of the month',
      'end of october',
      'mid-october',
      'mid november',
      '10 sep',
      'oct 3rd',
      'wed 16 sep',
      'saturday 10 oct',
      '2026-10-09',
      '15 october',
      '1st dec',
      'eod tomorrow',
    ];
    const prefixes = ['', 'by ', 'on ', 'due ', 'before ', 'until '];
    const phrases = cores.flatMap((c) => prefixes.map((p) => p + c));
    expect(phrases.length).toBeGreaterThanOrEqual(100);
    for (const p of phrases) {
      expect(isDatePhrase(p), p).toBe(true);
      expect(resolveDue(p, '2026-09-14', false).date, p).not.toBeNull();
    }
  });
  it('M6-127 DATE_RULES_HELP', () => {
    expect(DATE_RULES_HELP.length).toBeGreaterThan(0);
    expect(DATE_RULES_HELP).toMatch(/same weekday .*\+7/);
    expect(DATE_RULES_HELP).toContain('next <weekday>');
  });
});

describe('H. inferred and missing meeting dates', () => {
  it('M6-130 inferred meeting, relative due', () =>
    expect(resolveDue('by Friday', '2026-10-03', true)).toMatchObject({
      date: '2026-10-09',
      inferred: true,
    }));
  it('M6-131 absolute ISO does not depend on the meeting date', () =>
    expect(resolveDue('2026-10-09', '2026-10-03', true)).toMatchObject({
      date: '2026-10-09',
      inferred: false,
    }));
  it('M6-132 unresolvable stays inferred=false', () =>
    expect(resolveDue('by the end of the cutover', '2026-10-03', true)).toMatchObject({
      reason: 'unresolvable',
      inferred: false,
    }));
  it('M6-133 untitled.md style: no meeting date [GAP]', () =>
    expect(resolveDue('by Friday', null, false)).toEqual({
      raw: 'by Friday',
      date: null,
      inferred: false,
      reason: 'no-meeting-date',
    }));
  it('M6-134 untitled.md style: ISO resolves [GAP]', () =>
    expect(date('2026-10-09', null)).toBe('2026-10-09'));
  it('M6-135 unresolved items carry raw text, reason and a warning [GAP]', () => {
    const { due, warnings } = resolveDueWithWarnings('by Friday', null, false);
    expect(due.raw).toBe('by Friday');
    expect(due.reason).toBe('no-meeting-date');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('by Friday');
  });
});

describe('I. duplicates and repeats [DUP]', () => {
  it('M6-140 each repeat resolves against its own meeting date', () => {
    const got = ['2026-09-01', '2026-09-15', '2026-09-22'].map((m) => date('by Thursday', m));
    expect(got).toEqual(['2026-09-03', '2026-09-17', '2026-09-24']);
  });
  it('M6-141 pure: identical on repeat calls', () =>
    expect(resolveDue('by Friday', '2026-09-14', false)).toEqual(
      resolveDue('by Friday', '2026-09-14', false),
    ));
  it('M6-142 no clock involved', () => {
    const before = resolveDue('tomorrow', '2026-09-14', false);
    const RealDate = globalThis.Date;
    try {
      // a different "today" must not matter
      globalThis.Date = class extends RealDate {
        constructor(...args: unknown[]) {
          super(...((args.length ? args : [0]) as [number]));
        }
        static override now() {
          return 0;
        }
      } as DateConstructor;
      expect(resolveDue('tomorrow', '2026-09-14', false)).toEqual(before);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});
