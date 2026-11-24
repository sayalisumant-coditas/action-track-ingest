import { afterEach, describe, expect, it } from 'vitest';
import { dateToISO, splitFrontMatter } from '../../../src/core/parse/frontmatter.js';
import { WarningCode } from '../../../src/core/warnings.js';

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('A. splitFrontMatter', () => {
  it('M2-01 parses keys and returns the body', () => {
    const r = splitFrontMatter('---\ntitle: X\ndate: 2026-09-16\nattendees: [A, B]\n---\nbody');
    expect(r.data).toEqual({ title: 'X', date: '2026-09-16', attendees: ['A', 'B'] });
    expect(r.body).toBe('body');
    expect(r.warnings).toEqual([]);
  });

  it('M2-02 no front matter', () => {
    const t = '# Meeting: X\nDate: 2026-09-01\n';
    expect(splitFrontMatter(t)).toEqual({ data: {}, body: t, bodyOffsetLines: 0, warnings: [] });
  });

  it('M2-03 unclosed fence is not front matter [BAD]', () => {
    const t = '---\ntitle: X\nno closing fence\n';
    const r = splitFrontMatter(t);
    expect(r.data).toEqual({});
    expect(r.body).toBe(t);
    expect(r.bodyOffsetLines).toBe(0);
    expect(r.warnings[0]?.code).toBe(WarningCode.FRONTMATTER_INVALID);
  });

  it('M2-04 invalid YAML does not throw [BAD]', () => {
    const t = '---\ntitle: [unclosed\n---\nbody';
    const r = splitFrontMatter(t);
    expect(r.data).toEqual({});
    expect(r.body).toBe(t);
    expect(r.warnings[0]?.code).toBe(WarningCode.FRONTMATTER_INVALID);
  });

  it('M2-05 empty front matter', () => {
    const r = splitFrontMatter('---\n---\nrest');
    expect(r.data).toEqual({});
    expect(r.body).toBe('rest');
    expect(r.bodyOffsetLines).toBe(2);
    expect(r.warnings).toEqual([]);
  });

  it('M2-06 bodyOffsetLines for a 5-line block', () => {
    const r = splitFrontMatter('---\na: 1\nb: 2\nc: 3\n---\nfirst body line\n');
    expect(r.bodyOffsetLines).toBe(5);
    // body line 1 is original line 1 + 5 = 6
    expect(r.body.split('\n')[0]).toBe('first body line');
    expect(r.bodyOffsetLines + 1).toBe(6);
  });

  it('M2-07 dates are UTC strings in any timezone', () => {
    for (const tz of ['America/Los_Angeles', 'Asia/Kolkata', 'UTC', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      expect(dateToISO(new Date(Date.UTC(2026, 8, 16)))).toBe('2026-09-16');
      expect(splitFrontMatter('---\ndate: 2026-09-16\n---\n').data.date).toBe('2026-09-16');
    }
  });

  it('M2-08 a horizontal rule mid-body is not front matter', () => {
    const t = '# Title\n\ntext\n\n---\n\nmore\n';
    const r = splitFrontMatter(t);
    expect(r.data).toEqual({});
    expect(r.body).toBe(t);
  });

  it('M2-09 confidential is exposed', () =>
    expect(splitFrontMatter('---\nconfidential: true\n---\n').data.confidential).toBe(true));

  it('M2-10 no date key [GAP]', () => {
    const r = splitFrontMatter('---\ntitle: X\n---\nbody');
    expect(r.data.date).toBeUndefined();
  });
});
