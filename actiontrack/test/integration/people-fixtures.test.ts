import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractCandidates } from '../../src/core/parse/candidates.js';
import { splitFrontMatter } from '../../src/core/parse/frontmatter.js';
import { parseMeetingHeader } from '../../src/core/parse/meeting.js';
import { buildDirectory } from '../../src/core/people/directory.js';
import { resolveOwner } from '../../src/core/people/resolveOwner.js';
import { readNote } from '../../src/core/scan/readNote.js';
import { scanFolder } from '../../src/core/scan/scanFolder.js';
import type { Meeting } from '../../src/core/types.js';
import { NOTES_DIR } from '../helpers/fixtures.js';

/**
 * M4 (line parser) is not part of M5, so this file uses a small stand-in to pull the owner text
 * out of a candidate: `@name:` / `Name: ` / `Owner to ...` / `Owner will|should ...`, and a
 * trailing `(with X)`. Table rows use the Owner cell.
 */
function ownerOf(text: string, tableOwner?: string): { owner: string; helper?: string } {
  if (tableOwner !== undefined) return { owner: tableOwner };
  const m = /^@?([^:]+?):\s/.exec(text) ?? /^(.+?)\s+(?:to|will|should)\s/.exec(text) ?? null;
  if (!m) return { owner: '' };
  const w = /^(.*?)\s*\(with\s+([^)]*)\)\s*$/.exec(m[1] as string);
  return w ? { owner: w[1] as string, helper: w[2] } : { owner: m[1] as string };
}

const files = scanFolder(NOTES_DIR).flatMap((p) => {
  const r = readNote(p);
  return r.ok ? [{ name: basename(p), text: r.text }] : [];
});
const headers = files.map((f) => parseMeetingHeader(f.text, f.name, { confidentialPatterns: [] }));
const meetings: Meeting[] = headers.map((h) => h.meeting);
const dir = buildDirectory(meetings);

interface Row {
  file: string;
  line: number;
  raw: string;
  kind: string;
  people: string[];
  candidates: string[];
  helpers: string[];
}
const rows: Row[] = [];
let threw = 0;
files.forEach((f, i) => {
  const meeting = meetings[i] as Meeting;
  const fm = splitFrontMatter(f.text);
  for (const c of extractCandidates(fm.body, fm.bodyOffsetLines).candidates) {
    try {
      const { owner, helper } = ownerOf(c.text, c.table?.owner);
      const r = resolveOwner(owner, helper, meeting, dir);
      rows.push({
        file: f.name,
        line: c.line,
        raw: owner,
        kind: r.owner.kind,
        people: r.owner.people,
        candidates: r.owner.candidates,
        helpers: r.owner.helpers,
      });
    } catch {
      threw++;
    }
  }
});

describe('I. whole folder', () => {
  it('M5-10 directory has both Priyas and both Rahuls [NAME]', () => {
    const n = dir.people.map((p) => p.fullName);
    expect(n).toEqual(
      expect.arrayContaining(['Priya Nair', 'Priya Shah', 'Rahul Mehta', 'Rahul Verma']),
    );
  });

  it('M5-120 no exception on any owner', () => {
    expect(threw).toBe(0);
    expect(rows.length).toBeGreaterThan(100);
  });

  it('M5-121 ambiguous owners: the five known cases plus 10-08 Priya (both Priyas attend) [NAME]', () => {
    const amb = rows
      .filter((r) => r.kind === 'ambiguous' && r.file !== 'untitled.md')
      .map((r) => `${r.file.slice(0, 10)} ${r.raw}`)
      .sort();
    expect(amb).toEqual(
      [
        '2026-09-17 Priya',
        '2026-09-23 Rahul',
        '2026-09-30 Priya',
        '2026-09-30 Rahul',
        '2026-10-07 Rahul',
        // not in the plan's list, but both Priyas attend and the item says bare "Priya"
        '2026-10-08 Priya',
      ].sort(),
    );
  });

  it('M5-122 untitled.md owners are resolved, never dropped [GAP]', () => {
    const u = rows.filter((r) => r.file === 'untitled.md');
    expect(u).toHaveLength(2);
    expect(u.find((r) => r.raw === 'Sam')?.kind).toBe('person');
    // no attendee list and two Priyas in the directory: ambiguous by the rules
    expect(u.find((r) => r.raw === 'Priya')?.kind).toBe('ambiguous');
  });

  it('M5-123 Someone / TBD / no owner are unassigned [GAP]', () => {
    const un = rows.filter((r) => /^(someone|tbd|)$/i.test(r.raw));
    expect(un.length).toBeGreaterThanOrEqual(2);
    expect(un.every((r) => r.kind === 'unassigned')).toBe(true);
  });

  it('M5-124 Team and Everyone are groups', () => {
    const g = rows.filter((r) => /^(team|everyone)$/i.test(r.raw));
    expect(g.length).toBeGreaterThanOrEqual(3);
    expect(g.every((r) => r.kind === 'group')).toBe(true);
  });

  it('known fixture cases: joint owner, helper, initials', () => {
    const find = (file: string, raw: string) => rows.find((r) => r.file === file && r.raw === raw);
    expect(find('2026-09-18-design-review.md', 'Anita & Rahul')?.people).toEqual([
      'anita-desai',
      'rahul-mehta',
    ]);
    const lena = find('2026-09-18-design-review.md', 'Lena');
    expect(lena?.people).toEqual(['lena-fischer']);
    expect(lena?.helpers).toEqual(['priya-nair']);
    expect(find('2026-09-29-billing-cutover-planning.md', 'Priya S.')?.people).toEqual([
      'priya-shah',
    ]);
    expect(find('2026-09-29-billing-cutover-planning.md', 'Priya N.')?.people).toEqual([
      'priya-nair',
    ]);
  });

  it('M5-125 snapshot of all owners', async () => {
    const out = rows
      .map(
        (r) =>
          `${r.file}:${r.line}\t${JSON.stringify(r.raw)}\t${r.kind}\t${r.people.join('+')}` +
          `${r.candidates.length ? `\tcand=${r.candidates.join('|')}` : ''}` +
          `${r.helpers.length ? `\thelp=${r.helpers.join('+')}` : ''}`,
      )
      .join('\n');
    await expect(out + '\n').toMatchFileSnapshot('../snapshots/m5-owners.txt');
  });
});
