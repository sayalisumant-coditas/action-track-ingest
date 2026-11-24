import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractCandidates } from '../../src/core/parse/candidates.js';
import { splitFrontMatter } from '../../src/core/parse/frontmatter.js';
import { parseCandidate, type ParsedLine } from '../../src/core/parse/line.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import { NOTES_DIR } from '../helpers/fixtures.js';

const parsed = new Map<string, ParsedLine[]>();
const threw: string[] = [];
for (const p of scanFolder(NOTES_DIR)) {
  const note = readNote(p);
  if (!note.ok) continue;
  const name = basename(p);
  try {
    const fm = splitFrontMatter(note.text);
    const { candidates } = extractCandidates(fm.body, fm.bodyOffsetLines);
    parsed.set(name, candidates.map(parseCandidate));
  } catch {
    threw.push(name);
  }
}
const all = [...parsed.values()].flat();
const find = (file: string, includes: string) =>
  parsed.get(file)?.find((l) => l.candidate.text.includes(includes) || l.task.includes(includes));

describe('E. whole-pipeline checks', () => {
  it('M4-90 every candidate in the 33 files parses to a non-empty task', () => {
    expect(threw).toEqual([]);
    expect(parsed.size).toBe(33);
    expect(all.length).toBeGreaterThan(80);
    for (const l of all) expect(l.task, `${l.candidate.line}: ${l.candidate.rawLine}`).not.toBe('');
  });

  it('M4-91 repeated lines give the same owner family and task up to "the" [DUP]', () => {
    const a = find('2026-09-01-quote-portal-kickoff.md', 'revised quote');
    const b = find('2026-09-08-quote-portal-weekly.md', 'revised quote');
    expect(a?.ownerRaw).toBe('Priya');
    expect(b?.ownerRaw).toBe('Priya N.');
    const strip = (t?: string) => (t ?? '').replace(/\bthe\s+/g, '');
    expect(strip(a?.task)).toBe(strip(b?.task));
  });

  it('M4-92 ambiguous owners stay bare first names [NAME]', () => {
    expect(find('2026-09-17-billing-migration-sync.md', 'sign off')?.ownerRaw).toBe('Priya');
    expect(find('2026-10-07-standup.md', 'Anita')?.ownerRaw).toBe('Rahul');
    expect(find('2026-09-30-q4-offsite.md', 'hiring plan')?.ownerRaw).toBe('Priya');
    expect(find('2026-09-30-q4-offsite.md', 'architecture overview')?.ownerRaw).toBe('Rahul');
  });

  it('M4-93 untitled.md items parse [GAP]', () => {
    const items = parsed.get('untitled.md') ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const l of items) expect(l.task).not.toBe('');
  });

  it('design-review forms: @anita, joint owners, helper, TBD, Everyone', () => {
    const f = '2026-09-18-design-review.md';
    expect(find(f, 'colour contrast')).toMatchObject({ ownerRaw: 'anita', dueRaw: 'Mon' });
    expect(find(f, 'component API')?.ownerRaw).toBe('Anita & Rahul');
    expect(find(f, 'user feedback')).toMatchObject({ ownerRaw: 'Lena', helperRaw: 'Priya' });
    expect(find(f, 'changelog')?.ownerRaw).toBe('TBD');
    expect(find(f, 'next review')).toMatchObject({ ownerRaw: 'Everyone', dueRaw: null });
  });

  it('M4-96 snapshot of all parsed lines', async () => {
    const out = [...parsed].flatMap(([file, lines]) =>
      lines.map((l) => ({
        file,
        line: l.candidate.line,
        owner: l.ownerRaw,
        helper: l.helperRaw ?? null,
        task: l.task,
        due: l.dueRaw,
      })),
    );
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m4-parsed-lines.json',
    );
  });
});
