import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderError, StoreError } from '../../src/core/errors.js';
import { ingest, type IngestOptions } from '../../src/core/ingest.js';
import { exitCodeFor } from '../../src/core/report.js';
import { defaultPeopleConfig } from '../../src/core/people/config.js';
import { loadStore, saveStore, MISSING_FLAG } from '../../src/core/store/store.js';
import { markDone } from '../../src/core/store/overrides.js';
import type { ActionItem } from '../../src/core/types.js';
import { fixedClock } from '../helpers/factory.js';
import { NOTES_DIR, copyFixturesToTemp } from '../helpers/fixtures.js';

let work: string;
let storeFile: string;
let seq = 0;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'at-m9-'));
  storeFile = join(work, 'store.json');
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const run = (dir: string, extra: Partial<IngestOptions> = {}) =>
  ingest(dir, { store: storeFile, clock: fixedClock, ...extra });

/** Ingest into a brand-new store (earlier runs in the same test are forgotten). */
const runFresh = (dir: string, extra: Partial<IngestOptions> = {}) => {
  rmSync(storeFile, { force: true });
  return run(dir, extra);
};

/** A fresh folder holding the given files. */
function folder(files: Record<string, string | Buffer>): string {
  const dir = join(work, `d${seq++}`);
  mkdirSync(dir);
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
  return dir;
}
const note = (title: string, date: string, attendees: string, body: string) =>
  `# Meeting: ${title}\nDate: ${date}\nAttendees: ${attendees}\n\n## Action items\n${body}\n`;

const store = () => loadStore(storeFile);
const inFile = (file: string, items: ActionItem[] = store().items) =>
  items.filter((i) => i.occurrences.some((o) => o.sourceFile === file));
const byTask = (re: RegExp) => store().items.filter((i) => re.test(i.task));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 1]);
const GOOD = (n = 1) =>
  note('Good', `2026-09-0${n}`, 'Sam Okafor', `- [ ] Sam to finish task number ${n} by Friday`);

describe('A. malformed notes [BAD]', () => {
  it('M9-01 one empty file', async () => {
    const r = await runFresh(folder({ 'a.md': '' }));
    expect(r.skipped).toEqual([{ file: 'a.md', reason: 'empty' }]);
    expect(r.items).toBe(0);
    expect(exitCodeFor(r)).toBe(0);
  });
  it('M9-02 a PNG named .md', async () => {
    const r = await runFresh(folder({ 'a.md': PNG }));
    expect(r.skipped).toEqual([{ file: 'a.md', reason: 'binary' }]);
  });
  it('M9-03 whitespace-only file', async () => {
    const r = await runFresh(folder({ 'a.md': '  \n\t\n  ' }));
    expect(r.skipped).toEqual([{ file: 'a.md', reason: 'empty' }]);
  });
  it('M9-04 only bad files: exit 0, all listed, empty store saved', async () => {
    const r = await runFresh(folder({ 'a.md': '', 'b.md': PNG, 'c.md': '   ' }));
    expect(r.skipped.map((s) => s.file)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(r.items).toBe(0);
    expect(exitCodeFor(r)).toBe(0);
    expect(store().items).toEqual([]);
    expect(store().lastIngest?.report.skipped).toHaveLength(3);
  });
  it('M9-05 one good + one empty + one binary', async () => {
    const r = await runFresh(folder({ 'good.md': GOOD(), 'empty.md': '', 'bin.md': PNG }));
    expect(store().items).toHaveLength(1);
    expect(r.skipped).toContainEqual({ file: 'empty.md', reason: 'empty' });
    expect(r.skipped).toContainEqual({ file: 'bin.md', reason: 'binary' });
  });
  it('M9-06 a bad file first alphabetically does not stop processing', async () => {
    const r = await runFresh(folder({ '0-bad.md': '', 'a.md': GOOD(1), 'b.md': GOOD(2) }));
    expect(r.items).toBe(2);
  });
  it('M9-07 a bad file among 10 good ones changes nothing else', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`f${i}.md`] = GOOD((i % 9) + 1).replace('number', `no ${i}`);
    await runFresh(folder(files));
    const clean = readFileSync(storeFile, 'utf8');
    const r = await runFresh(folder({ ...files, 'f5b.md': '' }));
    expect(r.skipped).toEqual([{ file: 'f5b.md', reason: 'empty' }]);
    const strip = (t: string) => JSON.stringify((JSON.parse(t) as { items: unknown }).items);
    expect(strip(readFileSync(storeFile, 'utf8'))).toBe(strip(clean));
  });
  it('M9-08 an EACCES while handling one file: unreadable, others processed', async () => {
    const dir = folder({ 'a.md': GOOD(1), 'b.md': GOOD(2) });
    const r = await run(dir, {
      stages: {
        parseHeader: (text, name, o) => {
          if (name === 'b.md')
            throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
          return realHeader(text, name, o);
        },
      },
    });
    expect(r.skipped).toEqual([
      { file: 'b.md', reason: 'unreadable', message: 'EACCES: permission denied' },
    ]);
    expect(r.items).toBe(1);
  });
  it('M9-09 / M9-10 any single stage throwing is caught and reported', async () => {
    const dir = folder({ 'a.md': GOOD(1), 'b.md': GOOD(2) });
    const boom = (): never => {
      throw new Error('boom');
    };
    const cases: Partial<IngestOptions['stages'] & object>[] = [
      { parseHeader: (t, n, o) => (n === 'b.md' ? boom() : realHeader(t, n, o)) },
      { extract: (b, off) => (b.includes('number 2') ? boom() : realExtract(b, off)) },
      { parseLine: (c) => (c.rawLine.includes('number 2') ? boom() : realParse(c)) },
      {
        resolveDue: (d, m, i) => (d === 'Friday' && m === '2026-09-02' ? boom() : realDue(d, m, i)),
      },
    ];
    for (const stages of cases) {
      const r = await run(dir, { stages });
      expect(r.skipped).toEqual([{ file: 'b.md', reason: 'unreadable', message: 'boom' }]);
      expect(r.items).toBe(1);
      expect(exitCodeFor(r)).toBe(0);
    }
  });
  it('M9-11 broken front matter: still ingested, title from file name, not skipped', async () => {
    const dir = folder({
      '2026-09-01-weekly-sync.md': '---\ntitle: [unclosed\n  : : bad\n---\n\n- [ ] Sam to do it\n',
    });
    const r = await runFresh(dir);
    expect(r.skipped).toEqual([]);
    expect(r.meetings).toBe(1);
    expect(r.items).toBe(1);
    expect(r.warnings.map((w) => w.code)).toContain('FRONTMATTER_INVALID');
  });
  it('M9-12 unclosed fence: FENCE_UNCLOSED and items before it kept', async () => {
    const dir = folder({
      'a.md': '# A\nDate: 2026-09-01\n\n- [ ] Sam to keep this\n\n```\n- [ ] Sam to hide this\n',
    });
    const r = await runFresh(dir);
    expect(r.warnings.map((w) => w.code)).toContain('FENCE_UNCLOSED');
    expect(store().items.map((i) => i.task)).toEqual(['keep this']);
  });
  it('M9-13 header but no actions: meeting kept, no-actions entry', async () => {
    const r = await runFresh(folder({ 'a.md': '# Chat\nDate: 2026-09-01\n\nJust talk.\n' }));
    expect(r.meetings).toBe(1);
    expect(r.skipped).toEqual([{ file: 'a.md', reason: 'no-actions' }]);
  });
  it('M9-14 prose-only file with no header: unknown meeting, no items', async () => {
    const r = await runFresh(folder({ 'notes.md': 'just some words\nand more words\n' }));
    expect(r.meetings).toBe(1);
    expect(store().meetings[0]).toMatchObject({ date: null, attendees: [] });
    expect(r.skipped).toEqual([{ file: 'notes.md', reason: 'no-actions' }]);
  });
  it('M9-15 a .txt file with a checkbox is never read or reported', async () => {
    const r = await runFresh(folder({ 'a.txt': '- [ ] Sam to hide', 'b.md': GOOD() }));
    expect(r.filesScanned).toBe(1);
    expect(JSON.stringify(r)).not.toContain('a.txt');
  });
  it('M9-16 a binary file named .MD', async () => {
    const r = await runFresh(folder({ 'A.MD': PNG }));
    expect(r.skipped).toEqual([{ file: 'A.MD', reason: 'binary' }]);
  });
  it('M9-17 property: 100 random byte + 100 random text files, none lost, never throws', async () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const words = [
      '- [ ] ',
      'Sam to ',
      'Priya ',
      'by Friday',
      '\n',
      '# Meeting: x\n',
      'Date: 2026-09-01\n',
      '```\n',
      '| a | b |\n',
      '> ',
      '<!-- ',
      '---\n',
    ];
    const files: Record<string, Buffer | string> = {};
    for (let i = 0; i < 100; i++) {
      const b = Buffer.alloc(Math.floor(rnd() * 200));
      for (let j = 0; j < b.length; j++) b[j] = Math.floor(rnd() * 256);
      files[`bytes${i}.md`] = b;
      let t = '';
      for (let j = 0; j < 20; j++) t += words[Math.floor(rnd() * words.length)];
      files[`text${i}.md`] = t;
    }
    const r = await runFresh(folder(files));
    const lost = r.skipped.filter((s) => s.reason !== 'no-actions').length;
    expect(r.meetings + lost).toBe(200);
    expect(r.filesScanned).toBe(200);
  });
  it.skip('M9-18 file that disappears mid-run — needs a hook between scan and read; the stage-throw tests (M9-08/09) cover the same catch path', () => {});
  it('M9-19 every skipped file has a reason and a name', async () => {
    const r = await runFresh(folder({ 'a.md': '', 'b.md': PNG, 'c.md': 'prose' }));
    for (const s of r.skipped) {
      expect(s.file).toMatch(/\.md$/);
      expect(s.reason).toBeTruthy();
    }
    expect(r.skipped).toHaveLength(3);
  });
});

describe('B. duplicates across meetings [DUP]', () => {
  beforeEach(async () => void (await run(NOTES_DIR)));

  it('M9-30 quote-to-Acme once, done, 3 occurrences', () => {
    const f = byTask(/revised quote to Acme/);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ status: 'done' });
    expect(f[0]?.occurrences).toHaveLength(3);
  });
  it('M9-31 cloud budget once, done', () => {
    const f = byTask(/confirm cloud budget/);
    expect(f).toHaveLength(1);
    expect(f[0]?.status).toBe('done');
  });
  it('M9-32 wireframes: due 2026-09-24 with the slip in dueHistory', () => {
    const f = byTask(/share updated wireframes/);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ dueHistory: ['2026-09-17'], due: { date: '2026-09-24' } });
  });
  it('M9-33 estimate vs start of the SSO spike stay separate', () => {
    expect(
      byTask(/SSO/)
        .map((i) => i.task)
        .sort(),
    ).toEqual(['estimate the SSO work', 'start SSO spike']);
  });
  it('M9-34 same task, different owner: two items', async () => {
    const dir = folder({
      'a.md': note(
        'A',
        '2026-09-01',
        'Sam Okafor, Karan Joshi',
        '- [ ] Sam to send the invoice batch\n- [ ] Karan to send the invoice batch',
      ),
    });
    await runFresh(dir);
    expect(byTask(/invoice batch/)).toHaveLength(2);
  });
  it('M9-35 the borderline pair is not merged and is listed with both ids and a score', async () => {
    const r = await run(NOTES_DIR);
    expect(r.uncertainMerges).toHaveLength(1);
    const u = r.uncertainMerges[0] as { a: string; b: string; score: number };
    const ids = store().items.map((i) => i.id);
    expect(ids).toContain(u.a);
    expect(ids).toContain(u.b);
    expect(u.score).toBeGreaterThanOrEqual(0.6);
    expect(u.score).toBeLessThan(0.85);
  });
  it('M9-36 the same file under two names: no crash, stable ids', async () => {
    const body = GOOD(3);
    const dir = folder({ 'one.md': body, 'two.md': body });
    const r1 = await runFresh(dir);
    const ids1 = store().items.map((i) => i.id);
    await run(dir);
    expect(store().items.map((i) => i.id)).toEqual(ids1);
    expect(r1.meetings).toBe(2);
    expect(r1.items).toBe(1); // identical text and owner merge into one item
    expect(store().items[0]?.occurrences).toHaveLength(2);
  });
  it('M9-37 ingesting twice: same bytes, same ids, no new items', async () => {
    const a = readFileSync(storeFile, 'utf8');
    await run(NOTES_DIR);
    expect(readFileSync(storeFile, 'utf8')).toBe(a);
  });
  it('M9-38 a done mark survives a re-ingest', async () => {
    const open = store().items.find((i) => i.status === 'open') as ActionItem;
    saveStore(storeFile, markDone(store(), open.id, fixedClock).store);
    await run(NOTES_DIR);
    expect(store().items.find((i) => i.id === open.id)?.status).toBe('done');
  });
  it('M9-39 the same line twice in one note is merged, with a warning', async () => {
    const dir = folder({
      'a.md': note(
        'A',
        '2026-09-01',
        'Sam Okafor',
        '- [ ] Sam to book the room\n- [ ] Sam to book the room',
      ),
    });
    const r = await runFresh(dir);
    expect(r.items).toBe(1);
    expect(r.warnings.map((w) => w.code)).toContain('DUPLICATE_IN_FILE');
  });
  it('M9-40 total occurrences equal the candidate count (nothing lost)', () => {
    // 119 occurrences across 96 items; the sample has 119 candidate lines after skipping empties
    const total = store().items.reduce((n, i) => n + i.occurrences.length, 0);
    expect(total).toBe(119);
  });
});

describe('C. missing owner and date [GAP]', () => {
  beforeEach(async () => void (await run(NOTES_DIR)));
  const one = (re: RegExp) => byTask(re)[0] as ActionItem;

  it('M9-50 Someone to update the CRM notes', () => {
    expect(one(/update the CRM notes/)).toMatchObject({
      owner: { kind: 'unassigned' },
      due: { date: null },
    });
  });
  it('M9-51 TBD to write the changelog', () => {
    expect(one(/design-system changelog/).owner.kind).toBe('unassigned');
  });
  it('M9-52 Team to decide on the launch date: group, no due', () => {
    expect(one(/launch date/)).toMatchObject({ owner: { kind: 'group' }, due: { date: null } });
  });
  it('M9-53 a line with no owner: unassigned, task is the full text', async () => {
    await runFresh(
      folder({ 'a.md': note('A', '2026-09-01', 'Sam Okafor', '- [ ] update the wiki home page') }),
    );
    expect(store().items[0]).toMatchObject({
      task: 'update the wiki home page',
      owner: { kind: 'unassigned' },
    });
  });
  it('M9-54 no due date: null date and raw, and no warning', async () => {
    const r = await runFresh(
      folder({ 'a.md': note('A', '2026-09-01', 'Sam Okafor', '- [ ] Sam to tidy up') }),
    );
    expect(store().items[0]?.due).toMatchObject({ date: null, raw: null });
    expect(r.warnings).toEqual([]);
  });
  it('M9-55 an unresolvable due keeps the text and warns', async () => {
    const r = await runFresh(
      folder({
        'a.md': note(
          'A',
          '2026-09-01',
          'Sam Okafor',
          '- [ ] Sam to cut over by the end of the cutover',
        ),
      }),
    );
    expect(store().items[0]?.due).toMatchObject({ date: null });
    expect(store().items[0]?.due.raw).toMatch(/end of the cutover/);
    expect(r.warnings.map((w) => w.code)).toContain('DUE_UNRESOLVABLE');
  });
  it('M9-56 untitled.md becomes an undated meeting with items', () => {
    expect(store().meetings.find((m) => m.sourceFile === 'untitled.md')).toMatchObject({
      date: null,
    });
    expect(inFile('untitled.md')).toHaveLength(2);
  });
  it('M9-57 untitled.md relative due: no date, reason no-meeting-date, flagged', async () => {
    const slides = byTask(/send the slides/)[0] as ActionItem;
    expect(slides.due).toMatchObject({ date: null, raw: 'Friday', reason: 'no-meeting-date' });
    const r = store().lastIngest?.report;
    expect(r?.warnings.some((w) => w.file === 'untitled.md' && w.code === 'DUE_UNRESOLVABLE')).toBe(
      true,
    );
  });
  it('M9-58 sales pipeline: date inferred once, relative dues marked inferred', () => {
    const m = store().meetings.find((x) => x.sourceFile === '2026-10-03-sales-pipeline.md');
    expect(m).toMatchObject({ date: '2026-10-03', dateInferred: true });
    expect(store().lastIngest?.report.warningCounts?.DATE_INFERRED).toBe(1);
    const rel = inFile('2026-10-03-sales-pipeline.md').filter(
      (i) => i.due.date !== null && i.due.raw !== i.due.date,
    );
    for (const i of rel) expect(i.due.inferred).toBe(true);
  });
  it('M9-59 standup without attendees is ingested; Rahul is ambiguous', () => {
    const items = inFile('2026-09-23-standup.md');
    expect(items.length).toBeGreaterThan(0);
    expect(items.find((i) => /rebase/.test(i.task))?.owner.kind).toBe('ambiguous');
  });
  it('M9-60 no owner and no due: both states stored', async () => {
    await runFresh(
      folder({ 'a.md': note('A', '2026-09-01', 'Sam Okafor', '- [ ] sort the shelves') }),
    );
    expect(store().items[0]).toMatchObject({
      owner: { kind: 'unassigned' },
      due: { date: null, raw: null },
    });
  });
  it('M9-61 table row with empty owner and due is stored', async () => {
    const body = '| Owner | Action | Due |\n|---|---|---|\n|  | Order new chairs |  |';
    await runFresh(folder({ 'a.md': note('A', '2026-09-01', 'Sam Okafor', body) }));
    expect(store().items).toHaveLength(1);
    expect(store().items[0]).toMatchObject({
      task: 'Order new chairs',
      owner: { kind: 'unassigned' },
      due: { date: null },
    });
  });
  it('M9-62 the report counts unassigned and no-due items', () => {
    expect(store().lastIngest?.report.counts).toEqual({
      unassigned: 2,
      noDueDate: 23,
      ambiguousOwner: 7,
    });
  });
});

describe('D. same first name [NAME]', () => {
  beforeEach(async () => void (await run(NOTES_DIR)));
  const owner = (file: string, re: RegExp) => inFile(file).find((i) => re.test(i.task))?.owner;

  it('M9-70 09-17 "Priya to sign off" is ambiguous between Nair and Shah', () => {
    expect(owner('2026-09-17-billing-migration-sync.md', /sign off/)).toMatchObject({
      kind: 'ambiguous',
      candidates: ['priya-nair', 'priya-shah'],
    });
  });
  it('M9-71 offsite: Priya hiring plan and Rahul architecture overview are ambiguous', () => {
    expect(owner('2026-09-30-q4-offsite.md', /hiring plan/)?.kind).toBe('ambiguous');
    expect(owner('2026-09-30-q4-offsite.md', /architecture overview/)?.kind).toBe('ambiguous');
  });
  it('M9-72 10-07 Rahul is ambiguous', () => {
    expect(inFile('2026-10-07-standup.md').some((i) => i.owner.kind === 'ambiguous')).toBe(true);
  });
  it('M9-73 09-23 Rahul with no attendee list is ambiguous', () => {
    expect(owner('2026-09-23-standup.md', /rebase/)?.kind).toBe('ambiguous');
  });
  it('M9-74 09-03: Rahul Verma and Priya Shah, no ambiguity warning', () => {
    const people = inFile('2026-09-03-billing-migration-sync.md').flatMap((i) => i.owner.people);
    expect(people).toEqual(expect.arrayContaining(['rahul-verma']));
    const w = store().lastIngest?.report.warnings.filter(
      (x) => x.file === '2026-09-03-billing-migration-sync.md',
    );
    expect(w?.some((x) => x.code === 'OWNER_AMBIGUOUS')).toBe(false);
  });
  it('M9-75 09-02 Rahul with only Mehta attending is Rahul Mehta', () => {
    const people = inFile('2026-09-02-standup.md').flatMap((i) => i.owner.people);
    expect(people).toContain('rahul-mehta');
  });
  it('M9-76 09-29 "Priya S." and "Priya N." resolve without warnings', () => {
    const items = inFile('2026-09-29-billing-cutover-planning.md');
    const raws = items.filter((i) => /^Priya [SN]\.?$/.test(i.owner.raw));
    expect(raws.length).toBeGreaterThan(0);
    for (const i of raws) expect(i.owner.kind).toBe('person');
    const w = store().lastIngest?.report.warnings.filter(
      (x) => x.file === '2026-09-29-billing-cutover-planning.md',
    );
    expect(w?.some((x) => x.code === 'OWNER_AMBIGUOUS')).toBe(false);
  });
  it('M9-77 the whole-folder ambiguous set is 7 lines (spec said 5; also 10-08 Priya and untitled Priya)', () => {
    const w = store().lastIngest?.report.warnings.filter((x) => x.code === 'OWNER_AMBIGUOUS') ?? [];
    expect(w.map((x) => `${x.file}:${x.line}`)).toEqual([
      '2026-09-17-billing-migration-sync.md:9',
      '2026-09-23-standup.md:8',
      '2026-09-30-q4-offsite.md:16',
      '2026-09-30-q4-offsite.md:17',
      '2026-10-07-standup.md:9',
      '2026-10-08-billing-go-no-go.md:9',
      'untitled.md:2',
    ]);
  });
  it('M9-78 a per-file alias resolves the 09-17 item, keeps its id, drops the warning', async () => {
    const before = byTask(/sign off the cutover/)[0] as ActionItem;
    const config = {
      ...defaultPeopleConfig(),
      fileAliases: { '2026-09-17-billing-migration-sync.md': { priya: 'Priya Nair' } },
    };
    const r = await run(NOTES_DIR, { config });
    const after = byTask(/sign off the cutover/)[0] as ActionItem;
    expect(after.owner).toMatchObject({ kind: 'person', people: ['priya-nair'] });
    expect(after.id).toBe(before.id);
    expect(
      r.warnings.filter(
        (w) => w.file === '2026-09-17-billing-migration-sync.md' && w.code === 'OWNER_AMBIGUOUS',
      ),
    ).toEqual([]);
  });
  it('M9-79 two different Priyas never merge on identical task text', async () => {
    const dir = folder({
      'a.md': note('A', '2026-09-01', 'Priya Nair, Sam Okafor', '- [ ] Priya to send the report'),
      'b.md': note('B', '2026-09-08', 'Priya Shah, Sam Okafor', '- [ ] Priya to send the report'),
    });
    await runFresh(dir);
    const items = byTask(/send the report/);
    expect(items).toHaveLength(2);
    expect(items.flatMap((i) => i.owner.people).sort()).toEqual(['priya-nair', 'priya-shah']);
  });
  it('M9-80 the directory is built from all files before owners resolve', async () => {
    const dir = folder({
      'a.md': note('A', '2026-09-01', 'Sam Okafor', '- [ ] Lena to send the deck'),
      'b.md': note('B', '2026-09-08', 'Lena Fischer', '- [ ] Lena to send the other deck'),
    });
    await runFresh(dir);
    expect(byTask(/^send the deck/)[0]?.owner).toMatchObject({
      kind: 'person',
      people: ['lena-fischer'],
    });
  });
});

describe('E. report contents', () => {
  it('M9-90..M9-96 headline numbers', async () => {
    const r = await run(NOTES_DIR);
    expect(r.filesScanned).toBe(35); // M9-90
    expect([r.filesRead, r.skipped.length]).toEqual([33, 2]); // M9-91
    expect(r.skipped.map((s) => s.file)).toEqual(['2026-09-09-notes-final-v2.md', 'scratch.md']);
    expect(r.meetings).toBe(33); // M9-92
    expect(r.ignoredCandidates.map((i) => `${i.file}:${i.why}`)).toEqual([
      '2026-09-21-incident-review.md:blockquote',
      '2026-10-09-security-review.md:code',
      '2026-10-09-security-review.md:comment',
    ]); // M9-93
    expect(r.warningCounts?.DATE_INFERRED).toBe(1); // M9-94
    expect(r.warningCounts?.OWNER_AMBIGUOUS).toBe(7); // M9-95 (spec said 5)
    expect(r.warnings.filter((w) => w.code === 'DUE_UNRESOLVABLE').length).toBe(1); // M9-96
  });
  it('M9-97 no stored item comes from an ignored line', async () => {
    await run(NOTES_DIR);
    const raws = store().items.flatMap((i) => i.occurrences.map((o) => o.rawLine));
    expect(raws.some((l) => /hardware tokens/.test(l))).toBe(false);
    expect(raws.some((l) => /remediate finding/.test(l))).toBe(false);
    // the quoted refund line is ignored; only the real, later refund line is stored
    const refunds = byTask(/refund affected customers/);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.occurrences[0]?.rawLine).not.toMatch(/^>/);
    expect(refunds[0]?.occurrences[0]?.line).toBeGreaterThan(10);
  });
  it('M9-98 offsite: the 9 items; the validation child belongs to the Meera item', async () => {
    await run(NOTES_DIR);
    const items = inFile('2026-09-30-q4-offsite.md');
    expect(items.map((i) => i.task).sort()).toEqual(
      [
        'Refresh the brand kit',
        'circulate the offsite summary',
        'finalise the Q4 sales targets',
        'own the hiring plan for the two QA roles',
        'prepare the architecture overview',
        'propose the on-call rotation',
        'run the customer survey',
        'submit their Q4 goals',
        'validate targets against the budget',
      ].sort(),
    );
    const parent = items.find((i) => /finalise the Q4/.test(i.task));
    expect(items.find((i) => /validate targets/.test(i.task))?.parentId).toBe(parent?.id);
    expect(items.find((i) => /Q4 goals/.test(i.task))).toMatchObject({
      owner: { kind: 'group' },
      due: { date: '2026-10-07' },
    });
    expect(items.find((i) => /brand kit/.test(i.task))?.due.date).toBe('2026-10-09');
    expect(items.find((i) => /offsite summary/.test(i.task))?.due.date).toBe('2026-10-01');
  });
  it('M9-99 every warning has file, code and message (line when known)', async () => {
    const r = await run(NOTES_DIR);
    for (const w of r.warnings) {
      expect(typeof w.file).toBe('string');
      expect(w.code).toBeTruthy();
      expect(w.message).toBeTruthy();
    }
    const withLine = r.warnings.filter((w) => w.code === 'OWNER_AMBIGUOUS');
    for (const w of withLine) expect(typeof w.line).toBe('number');
  });
  it('M9-100 report carries both the per-code summary and the full list', async () => {
    const r = await run(NOTES_DIR);
    expect(Object.values(r.warningCounts ?? {}).reduce((a, b) => a + b, 0)).toBe(r.warnings.length);
  });
  it('M9-101 exit code is 0, including for an all-bad folder', async () => {
    expect(exitCodeFor(await run(NOTES_DIR))).toBe(0);
    expect(exitCodeFor(await runFresh(folder({ 'a.md': '' })))).toBe(0);
  });
  it('M9-102 the report is JSON-serialisable', async () => {
    const r = await run(NOTES_DIR);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('F. errors and idempotence', () => {
  it('M9-110 missing folder names the path', async () => {
    const p = join(work, 'nope');
    await expect(run(p)).rejects.toBeInstanceOf(FolderError);
    await expect(run(p)).rejects.toThrow(p);
  });
  it('M9-111 a file given as the folder', async () => {
    const f = join(work, 'file.md');
    writeFileSync(f, GOOD());
    await expect(run(f)).rejects.toBeInstanceOf(FolderError);
  });
  it('M9-112 corrupt store: StoreError, untouched, nothing ingested', async () => {
    writeFileSync(storeFile, '{ nope');
    await expect(run(NOTES_DIR)).rejects.toBeInstanceOf(StoreError);
    expect(readFileSync(storeFile, 'utf8')).toBe('{ nope');
  });
  it('M9-113 empty folder: exit 0, zero files', async () => {
    const r = await runFresh(folder({}));
    expect(r).toMatchObject({ filesScanned: 0, filesRead: 0, meetings: 0, items: 0 });
    expect(exitCodeFor(r)).toBe(0);
  });
  it('M9-114 editing one file changes only that file’s items', async () => {
    const dir = copyFixturesToTemp();
    await run(dir);
    const before = store().items;
    const f = join(dir, '2026-09-02-standup.md');
    writeFileSync(f, readFileSync(f, 'utf8') + '\n- [ ] Sam to add a brand new thing\n');
    await run(dir);
    const after = store().items;
    expect(after.length).toBe(before.length + 1);
    for (const b of before) expect(after.find((a) => a.id === b.id)).toEqual(b);
    rmSync(dir, { recursive: true, force: true });
  });
  it('M9-115 removing a file flags its items missing-from-notes', async () => {
    const dir = copyFixturesToTemp();
    await run(dir);
    const only = inFile('2026-10-05-onboarding-retro.md').filter((i) => i.occurrences.length === 1);
    expect(only.length).toBeGreaterThan(0);
    rmSync(join(dir, '2026-10-05-onboarding-retro.md'));
    await run(dir);
    for (const i of only) {
      expect(store().items.find((x) => x.id === i.id)?.flags).toContain(MISSING_FLAG);
    }
    rmSync(dir, { recursive: true, force: true });
  });
  it('M9-116 file creation order does not change the result', async () => {
    const files = { 'a.md': GOOD(1), 'b.md': GOOD(2), 'c.md': GOOD(3) };
    await runFresh(folder(files));
    const a = readFileSync(storeFile, 'utf8');
    const rev = folder(Object.fromEntries(Object.entries(files).reverse()));
    // also give the files reversed timestamps
    let t = 1_700_000_000;
    for (const n of ['a.md', 'b.md', 'c.md']) utimesSync(join(rev, n), t, (t -= 1000));
    rmSync(storeFile);
    await run(rev);
    expect(readFileSync(storeFile, 'utf8')).toBe(a);
  });
  it('M9-117 two runs at different clock times differ only in lastIngest.at', async () => {
    await run(NOTES_DIR);
    const a = JSON.parse(readFileSync(storeFile, 'utf8')) as { lastIngest: { at: string } };
    await run(NOTES_DIR, { clock: () => new Date('2027-01-01T00:00:00.000Z') });
    const b = JSON.parse(readFileSync(storeFile, 'utf8')) as { lastIngest: { at: string } };
    expect(b.lastIngest.at).toBe('2027-01-01T00:00:00.000Z');
    a.lastIngest.at = b.lastIngest.at;
    expect(b).toEqual(a);
  });
  it('M9-118 200 synthetic files ingest in under 5 s', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      files[`2026-09-${String((i % 28) + 1).padStart(2, '0')}-m${i}.md`] = note(
        `Meeting ${i}`,
        `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
        'Sam Okafor, Karan Joshi',
        `- [ ] Sam to do unique thing ${i} about topic ${i * 7} by Friday\n- [ ] Karan to review item ${i}`,
      );
    }
    const dir = folder(files);
    const t = performance.now();
    const r = await runFresh(dir);
    expect(performance.now() - t).toBeLessThan(5000);
    expect(r.meetings).toBe(200);
  }, 20_000);
  it('M9-119 sub-folders only with recursive: true', async () => {
    const dir = folder({ 'top.md': GOOD(1) });
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'deep.md'), GOOD(2));
    expect((await runFresh(dir)).meetings).toBe(1);
    rmSync(storeFile);
    const r = await run(dir, { recursive: true });
    expect(r.meetings).toBe(2);
    expect(store().meetings.map((m) => m.sourceFile)).toEqual(['sub/deep.md', 'top.md']);
  });
  it('M9-120 snapshots of the stored items and the report', async () => {
    const r = await run(NOTES_DIR);
    const { items } = store();
    await expect(JSON.stringify(items, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m9-items.json',
    );
    await expect(JSON.stringify(r, null, 2) + '\n').toMatchFileSnapshot(
      '../snapshots/m9-report.json',
    );
  });
});

import { extractCandidates as realExtract } from '../../src/core/parse/candidates.js';
import { resolveDueWithWarnings as realDue } from '../../src/core/dates/resolveDue.js';
import { parseCandidate as realParse } from '../../src/core/parse/line.js';
import { parseMeetingHeader as realHeader } from '../../src/core/parse/meeting.js';
