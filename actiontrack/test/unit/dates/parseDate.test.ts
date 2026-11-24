import { describe, expect, it } from 'vitest';
import {
  dateFromFileName,
  parseDateText,
  parseDateTextDetailed,
} from '../../../src/core/dates/parseDate.js';

describe('B. parseDateText', () => {
  it('M2-20 ISO', () => expect(parseDateText('2026-09-01')).toBe('2026-09-01'));
  it('M2-21 D Month YYYY', () => expect(parseDateText('9 September 2026')).toBe('2026-09-09'));
  it('M2-22 Weekday, D Month YYYY', () =>
    expect(parseDateText('Monday, 14 September 2026')).toBe('2026-09-14'));
  it('M2-23 Month D, YYYY', () => {
    expect(parseDateText('Sep 9, 2026')).toBe('2026-09-09');
    expect(parseDateText('September 9, 2026')).toBe('2026-09-09');
  });
  it('M2-24 case-insensitive abbreviations', () => {
    expect(parseDateText('9 sep 2026')).toBe('2026-09-09');
    expect(parseDateText('9 SEPT 2026')).toBe('2026-09-09');
  });
  it('M2-25 impossible dates', () => {
    expect(parseDateText('31 February 2026')).toBeNull();
    expect(parseDateText('2026-02-30')).toBeNull();
  });
  it('M2-26 leap day', () => expect(parseDateText('29 February 2028')).toBe('2028-02-29'));
  it('M2-27 wrong weekday keeps the date and reports a mismatch', () => {
    const r = parseDateTextDetailed('Tuesday, 14 September 2026');
    expect(r?.date).toBe('2026-09-14');
    expect(r?.weekdayMismatch).toEqual({ written: 'Tuesday', actual: 'mon' });
    expect(parseDateTextDetailed('Monday, 14 September 2026')?.weekdayMismatch).toBeUndefined();
  });
  it('M2-28 prose [GAP]', () => expect(parseDateText('sometime last week')).toBeNull());
  it('M2-29 empty / TBD / n/a [GAP]', () => {
    for (const s of ['', 'TBD', 'n/a']) expect(parseDateText(s), s).toBeNull();
  });
  it('M2-30 padding', () => expect(parseDateText('  2026-09-01  ')).toBe('2026-09-01'));
  it('M2-31 ISO datetime is null (pinned choice: date-only formats)', () =>
    expect(parseDateText('2026-09-01T10:00:00Z')).toBeNull());
  it('M2-32 no year is null', () => expect(parseDateText('1 Sept')).toBeNull());
});

describe('C. dateFromFileName', () => {
  it('M2-40 leading date', () =>
    expect(dateFromFileName('2026-09-01-quote-portal-kickoff.md')).toBe('2026-09-01'));
  it('M2-41 no date [GAP]', () => {
    expect(dateFromFileName('untitled.md')).toBeNull();
    expect(dateFromFileName('scratch.md')).toBeNull();
  });
  it('M2-42 invalid date', () => expect(dateFromFileName('2026-13-40-notes.md')).toBeNull());
  it('M2-43 date not leading', () => expect(dateFromFileName('notes-2026-09-01.md')).toBeNull());
});
