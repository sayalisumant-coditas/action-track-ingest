import { describe, expect, it } from 'vitest';
import {
  attendeeMatchName,
  inferMeetingDate,
  parseAttendees,
  parseMeetingHeader,
} from '../../../src/core/parse/meeting.js';
import { WarningCode } from '../../../src/core/warnings.js';

const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

describe('C. inferMeetingDate', () => {
  it('M2-44 header date, not inferred', () => {
    const r = inferMeetingDate('2026-09-09', '2026-09-09-x.md');
    expect(r).toMatchObject({ date: '2026-09-09', inferred: false, warnings: [] });
  });
  it('M2-45 filename fallback is inferred', () => {
    const r = inferMeetingDate(null, '2026-10-03-sales-pipeline.md');
    expect(r).toMatchObject({ date: '2026-10-03', inferred: true });
    expect(codes(r)).toEqual([WarningCode.DATE_INFERRED]);
  });
  it('M2-46 unreadable header date falls back to the filename', () => {
    const r = inferMeetingDate('sometime last week', '2026-10-03-sales-pipeline.md');
    expect(r).toMatchObject({ date: '2026-10-03', inferred: true });
  });
  it('M2-47 nothing at all [GAP]', () => {
    expect(inferMeetingDate(null, 'untitled.md')).toMatchObject({ date: null, inferred: false });
  });
  it('M2-48 header wins over a different filename date', () => {
    const r = inferMeetingDate('2026-09-10', '2026-09-09-x.md');
    expect(r).toMatchObject({ date: '2026-09-10', inferred: false });
    expect(codes(r)).toEqual([WarningCode.DATE_MISMATCH_FILENAME]);
  });
  it('weekday mismatch raises DATE_WEEKDAY_MISMATCH and keeps the date', () => {
    const r = inferMeetingDate('Tuesday, 14 September 2026', '2026-09-14-x.md');
    expect(r.date).toBe('2026-09-14');
    expect(codes(r)).toEqual([WarningCode.DATE_WEEKDAY_MISMATCH]);
  });
});

describe('D. parseAttendees', () => {
  it('M2-60 comma list', () =>
    expect(parseAttendees('Priya Nair, Sam Okafor, Anita Desai')).toEqual([
      'Priya Nair',
      'Sam Okafor',
      'Anita Desai',
    ]));
  it('M2-61 semicolons and "and"', () => {
    expect(parseAttendees('A; B; C')).toEqual(['A', 'B', 'C']);
    expect(parseAttendees('A, B and C')).toEqual(['A', 'B', 'C']);
  });
  it('M2-62 empties dropped', () => expect(parseAttendees('A,, B, ')).toEqual(['A', 'B']));
  it('M2-63 deduped', () => expect(parseAttendees('A, B, A')).toEqual(['A', 'B']));
  it('M2-64 role suffix: raw kept, match name stripped', () => {
    const r = parseAttendees('Priya Nair (PM), Sam Okafor');
    expect(r).toEqual(['Priya Nair (PM)', 'Sam Okafor']);
    expect(attendeeMatchName(r[0] as string)).toBe('Priya Nair');
  });
  it('M2-65 empty [GAP]', () => expect(parseAttendees('')).toEqual([]));
  it('M2-66 same first name stays separate [NAME]', () =>
    expect(parseAttendees('Priya Nair, Priya Shah')).toEqual(['Priya Nair', 'Priya Shah']));
  it('M2-67 double spaces', () => expect(parseAttendees('Priya  Nair')).toEqual(['Priya Nair']));
  it('M2-68 hyphens and apostrophes kept whole', () => {
    expect(parseAttendees("Anne-Marie O'Neil, Bob Smith Jr.")).toEqual([
      "Anne-Marie O'Neil",
      'Bob Smith Jr.',
    ]);
  });
  it('a comma inside a role suffix does not split', () =>
    expect(parseAttendees('Priya Nair (PM, EU), Sam')).toEqual(['Priya Nair (PM, EU)', 'Sam']));
  it('"and" inside a name does not split', () =>
    expect(parseAttendees('Sandy Anderson and Andre')).toEqual(['Sandy Anderson', 'Andre']));
});

describe('E. parseMeetingHeader', () => {
  const std =
    '# Meeting: Quote portal kickoff\nDate: 2026-09-01\nAttendees: A B, C D\n\n## Notes\n';

  it('M2-80 # Meeting: title', () =>
    expect(parseMeetingHeader(std, 'x.md').meeting.title).toBe('Quote portal kickoff'));
  it('M2-81 # title without Meeting:', () =>
    expect(parseMeetingHeader('# Quote portal kickoff\n', 'x.md').meeting.title).toBe(
      'Quote portal kickoff',
    ));
  it('M2-82 front matter title wins', () =>
    expect(parseMeetingHeader('---\ntitle: FM title\n---\n# Heading\n', 'x.md').meeting.title).toBe(
      'FM title',
    ));
  it('M2-83 filename slug fallback', () =>
    expect(parseMeetingHeader('just prose\n', 'My Notes.md').meeting.title).toBe('my-notes'));
  it('M2-84 Date: line used', () =>
    expect(parseMeetingHeader(std, 'x.md').meeting.date).toBe('2026-09-01'));
  it('M2-85 front matter date wins over Date: line', () =>
    expect(
      parseMeetingHeader('---\ndate: 2026-09-02\n---\nDate: 2026-09-05\n', 'x.md').meeting.date,
    ).toBe('2026-09-02'));
  it('M2-86 Date: deep in the body is ignored', () => {
    const t = '# Meeting: X\n\n## Discussion\nDate: 2026-09-05\n';
    expect(parseMeetingHeader(t, 'x.md').meeting.date).toBeNull();
    const t2 = '# Meeting: X\n\n- [ ] a task\nDate: 2026-09-05\n';
    expect(parseMeetingHeader(t2, 'x.md').meeting.date).toBeNull();
  });
  it('M2-87 bodyStartLine, plain and with front matter', () => {
    expect(parseMeetingHeader(std, 'x.md').bodyStartLine).toBe(4);
    const fm = '---\ntitle: T\ndate: 2026-09-16\n---\n\n## Discussion\n';
    expect(parseMeetingHeader(fm, 'x.md').bodyStartLine).toBe(5);
    const both = '---\ntitle: T\n---\n# Heading\nbody\n';
    expect(parseMeetingHeader(both, 'x.md').bodyStartLine).toBe(5);
  });
  it('M2-88 id is the slug without extension', () =>
    expect(parseMeetingHeader('', '2026-09-01-quote-portal-kickoff.md').meeting.id).toBe(
      '2026-09-01-quote-portal-kickoff',
    ));
  it('M2-89 same file name in different folders gets different ids [DUP]', () => {
    const a = parseMeetingHeader('', 'a/standup.md').meeting.id;
    const b = parseMeetingHeader('', 'b/standup.md').meeting.id;
    expect(a).not.toBe(b);
    expect(parseMeetingHeader('', 'a\\standup.md').meeting.id).toBe(a);
  });
  it('M2-90 confidential via front matter', () =>
    expect(parseMeetingHeader('---\nconfidential: true\n---\n', 'x.md').meeting.confidential).toBe(
      true,
    ));
  it('M2-91 confidential via config glob', () => {
    const opts = { confidentialPatterns: ['*security-review*'] };
    expect(parseMeetingHeader('', '2026-10-09-security-review.md', opts).meeting.confidential).toBe(
      true,
    );
    expect(parseMeetingHeader('', '2026-10-10-sales-weekly.md', opts).meeting.confidential).toBe(
      false,
    );
  });
  it('M2-92 empty or whitespace text [BAD]', () => {
    for (const t of ['', '  \n \n']) {
      const m = parseMeetingHeader(t, 'x.md').meeting;
      expect(m.date).toBeNull();
      expect(m.attendees).toEqual([]);
    }
  });
  it('M2-93 prose with no header [BAD] [GAP]', () => {
    const m = parseMeetingHeader(
      'We talked about stuff on Tuesday.\nNothing decided.\n',
      'notes.md',
    ).meeting;
    expect(m.title).toBe('notes');
    expect(m.date).toBeNull();
  });
  it('no attendees gives a notice, not a warning [GAP]', () => {
    const r = parseMeetingHeader('# Meeting: X\nDate: 2026-09-23\n', 'x.md');
    expect(r.meeting.attendees).toEqual([]);
    expect(r.notices).toEqual(['no attendees listed']);
    expect(r.warnings).toEqual([]);
  });
  it('front matter present but no date key falls back to the filename [GAP]', () => {
    const r = parseMeetingHeader('---\ntitle: T\n---\n', '2026-09-16-standup.md');
    expect(r.meeting).toMatchObject({ date: '2026-09-16', dateInferred: true });
  });
  it('front matter attendees array', () =>
    expect(
      parseMeetingHeader('---\nattendees: [A One, B Two]\n---\n', 'x.md').meeting.attendees,
    ).toEqual(['A One', 'B Two']));
  it('warnings carry the file name', () => {
    const r = parseMeetingHeader('# Meeting: X\nDate: nope\n', '2026-10-03-x.md');
    expect(r.warnings[0]).toMatchObject({ file: '2026-10-03-x.md', code: 'DATE_INFERRED' });
  });
});
