import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMeetingHeader } from '../../src/core/parse/meeting.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import { NOTES_DIR } from '../helpers/fixtures.js';

const CONFIG = { confidentialPatterns: ['*security-review*'] };

const parsed = new Map(
  scanFolder(NOTES_DIR).flatMap((p) => {
    const r = readNote(p);
    if (!r.ok) return [];
    const name = basename(p);
    return [[name, parseMeetingHeader(r.text, name, CONFIG)] as const];
  }),
);
const get = (n: string) => parsed.get(n)!;

describe('F. sample files', () => {
  it('M2-100 kickoff', () => {
    const m = get('2026-09-01-quote-portal-kickoff.md').meeting;
    expect(m.date).toBe('2026-09-01');
    expect(m.attendees).toHaveLength(4);
    expect(m.title).toBe('Quote portal kickoff');
  });
  it('M2-101 qa-standup', () =>
    expect(get('2026-09-09-qa-standup.md').meeting.date).toBe('2026-09-09'));
  it('M2-102 onboarding design: weekday matches', () => {
    const r = get('2026-09-14-onboarding-flow-design.md');
    expect(r.meeting.date).toBe('2026-09-14');
    expect(r.warnings.map((w) => w.code)).not.toContain('DATE_WEEKDAY_MISMATCH');
  });
  it('M2-103 YAML standup', () => {
    const m = get('2026-09-16-standup.md').meeting;
    expect(m.attendees).toHaveLength(3);
    expect(m.title).toBe('Team standup');
    expect(m.date).toBe('2026-09-16');
  });
  it('M2-104 second YAML standup', () => {
    const m = get('2026-09-30-standup.md').meeting;
    expect(m.date).toBe('2026-09-30');
    expect(m.attendees).toHaveLength(3);
  });
  it('M2-105 no attendees [GAP]', () => {
    const r = get('2026-09-23-standup.md');
    expect(r.meeting.attendees).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('M2-106 inferred date [GAP]', () => {
    const r = get('2026-10-03-sales-pipeline.md');
    expect(r.meeting).toMatchObject({ date: '2026-10-03', dateInferred: true });
    expect(r.warnings.map((w) => w.code)).toContain('DATE_INFERRED');
  });
  it('M2-107 header title differs from filename', () =>
    expect(get('2026-10-05-onboarding-retro.md').meeting.title).toBe('Onboarding flow checkpoint'));
  it('M2-108 untitled.md [GAP]', () => {
    const m = get('untitled.md').meeting;
    expect(m).toMatchObject({ title: 'untitled', date: null, attendees: [] });
  });
  it('M2-109 both Priyas [NAME]', () => {
    const a = get('2026-09-17-billing-migration-sync.md').meeting.attendees;
    expect(a).toContain('Priya Nair');
    expect(a).toContain('Priya Shah');
  });
  it('M2-110 both Rahuls [NAME]', () => {
    const a = get('2026-10-07-standup.md').meeting.attendees;
    expect(a).toContain('Rahul Mehta');
    expect(a).toContain('Rahul Verma');
  });
  it('M2-111 offsite has 9 attendees [NAME]', () =>
    expect(get('2026-09-30-q4-offsite.md').meeting.attendees).toHaveLength(9));
  it('M2-112 only the security review is confidential', () => {
    for (const [name, r] of parsed) {
      expect(r.meeting.confidential, name).toBe(name === '2026-10-09-security-review.md');
    }
  });
  it('M2-113 all 33 readable files; exactly 2 inferred or null', () => {
    expect(parsed.size).toBe(33);
    const odd = [...parsed]
      .filter(([, r]) => r.meeting.dateInferred || r.meeting.date === null)
      .map(([n]) => n)
      .sort();
    expect(odd).toEqual(['2026-10-03-sales-pipeline.md', 'untitled.md']);
  });
  it('M2-114 empty and binary input still returns a Meeting [BAD]', () => {
    const empty = parseMeetingHeader('', '2026-09-09-notes-final-v2.md').meeting;
    expect(empty).toMatchObject({ date: '2026-09-09', dateInferred: true });
    const bin = parseMeetingHeader('\u0000\u0001\u0002�# Meeting\u0000', 'scratch.md').meeting;
    expect(bin.date).toBeNull();
  });
  it('M2-115 snapshot of all 33 meetings', async () => {
    const out = Object.fromEntries(
      [...parsed].map(([n, r]) => [n, { ...r.meeting, bodyStartLine: r.bodyStartLine }]),
    );
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m2-meetings.json',
    );
  });
  it('no sample file produces a front matter warning', () => {
    for (const [n, r] of parsed) {
      expect(
        r.warnings.map((w) => w.code),
        n,
      ).not.toContain('FRONTMATTER_INVALID');
    }
  });
});
