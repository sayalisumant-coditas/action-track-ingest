import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractCandidates, type ExtractResult } from '../../src/core/parse/candidates.js';
import { splitFrontMatter } from '../../src/core/parse/frontmatter.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import { NOTES_DIR } from '../helpers/fixtures.js';

const results = new Map<string, ExtractResult>();
const throwing: string[] = [];
for (const p of scanFolder(NOTES_DIR)) {
  const r = readNote(p);
  if (!r.ok) continue;
  const name = basename(p);
  try {
    const fm = splitFrontMatter(r.text);
    results.set(name, extractCandidates(fm.body, fm.bodyOffsetLines));
  } catch {
    throwing.push(name);
  }
}
const get = (n: string) => results.get(n)!;
const texts = (n: string) => get(n).candidates.map((c) => c.text);

describe('G. fixtures', () => {
  it('M3-90 incident-review: 4 candidates, blockquote ignored', () => {
    const r = get('2026-09-21-incident-review.md');
    expect(r.candidates).toHaveLength(4);
    expect(r.ignored).toHaveLength(1);
    expect(r.ignored[0]?.why).toBe('blockquote');
  });

  it('M3-91 security-review: 4 candidates, one code, one comment', () => {
    const r = get('2026-10-09-security-review.md');
    expect(r.candidates).toHaveLength(4);
    expect(r.ignored.map((i) => i.why).sort()).toEqual(['code', 'comment']);
    expect(r.candidates.some((c) => /Owner to remediate|hardware tokens/.test(c.text))).toBe(false);
  });

  it('M3-92 q4-offsite: 9 candidates in order [NAME]', () => {
    const r = get('2026-09-30-q4-offsite.md');
    expect(r.candidates).toHaveLength(9);
    const starts = [
      'Meera',
      'Karan',
      'Lena',
      'Sam',
      'Priya',
      'Rahul',
      'Everyone',
      'Refresh',
      'Karan',
    ];
    expect(r.candidates.map((c, i) => c.text.startsWith(starts[i] as string))).toEqual(
      starts.map(() => true),
    );
    expect(r.candidates.map((c) => c.kind)).toEqual([
      'checkbox',
      'checkbox',
      'checkbox',
      'checkbox',
      'checkbox',
      'checkbox',
      'checkbox',
      'table',
      'action',
    ]);
    expect(r.candidates[1]?.parentLine).toBe(r.candidates[0]?.line);
    expect(r.candidates.filter((c) => c.parentLine !== undefined)).toHaveLength(1);
  });

  it('M3-93 finance-sync: [X] checked, * and + read', () => {
    const r = get('2026-10-02-finance-sync.md');
    expect(r.candidates.some((c) => c.checked)).toBe(true);
    expect(r.candidates.some((c) => /^\s*\*\s/.test(c.rawLine))).toBe(true);
    expect(r.candidates.some((c) => /^\s*\+\s/.test(c.rawLine))).toBe(true);
    expect(r.candidates.some((c) => /\[X\]/.test(c.rawLine))).toBe(true);
  });

  it('M3-94 design-review: 5 candidates, prose not extracted [GAP]', () => {
    const t = texts('2026-09-18-design-review.md');
    expect(t).toHaveLength(5);
    expect(t.join('\n')).not.toMatch(/Everybody should look at the prototype/);
  });

  it('M3-95 acme-renewal-prep: "Someone to" is a candidate [GAP]', () =>
    expect(texts('2026-09-10-acme-renewal-prep.md').some((t) => t.startsWith('Someone to'))).toBe(
      true,
    ));

  it('M3-96 untitled: 2 candidates [GAP]', () => expect(texts('untitled.md')).toHaveLength(2));

  it('M3-97 quote-portal weekly files all yield candidates [DUP]', () => {
    for (const n of [
      '2026-09-01-quote-portal-kickoff.md',
      '2026-09-08-quote-portal-weekly.md',
      '2026-09-15-quote-portal-weekly.md',
      '2026-09-22-quote-portal-weekly.md',
    ])
      expect(texts(n).length).toBeGreaterThan(0);
  });

  it('M3-98 parking lot contributes nothing', () => {
    const r = get('2026-09-30-q4-offsite.md');
    const parking = readNote(`${NOTES_DIR}/2026-09-30-q4-offsite.md`);
    const lines = (parking.ok ? parking.text : '').split('\n');
    const start = lines.findIndex((l) => /Parking lot/.test(l)) + 1;
    expect(r.candidates.every((c) => c.line < start)).toBe(true);
  });

  it('M3-99 whole folder: ignored totals', () => {
    expect(results.size).toBe(33);
    const tally: Record<string, number> = {};
    for (const r of results.values())
      for (const i of r.ignored) tally[i.why] = (tally[i.why] ?? 0) + 1;
    expect(tally).toEqual({ blockquote: 1, code: 1, comment: 1 });
  });

  it('M3-100 no exceptions on any file [BAD]', () => expect(throwing).toEqual([]));

  it('M3-101 snapshot of all candidates', async () => {
    const out = [...results.entries()]
      .map(([name, r]) =>
        [
          `# ${name}`,
          ...r.candidates.map(
            (c) =>
              `${c.line}\t${c.kind}\t${c.checked ? 'x' : ' '}\tindent=${c.indent}` +
              `${c.parentLine ? `\tparent=${c.parentLine}` : ''}\t${c.text}` +
              `${c.table ? `\t${JSON.stringify(c.table)}` : ''}`,
          ),
          ...r.ignored.map((i) => `ignored\t${i.line}\t${i.why}`),
          ...r.warnings.map((w) => `warn\t${w.line}\t${w.code}`),
        ].join('\n'),
      )
      .join('\n\n');
    await expect(out + '\n').toMatchFileSnapshot('../snapshots/m3-candidates.txt');
  });
});
