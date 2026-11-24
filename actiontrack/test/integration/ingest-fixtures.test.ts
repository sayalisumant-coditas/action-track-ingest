import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderError, StoreError } from '../../src/core/errors.js';
import { ingest } from '../../src/core/ingest.js';
import { parseCandidate as realParse } from '../../src/core/parse/line.js';
import { buildReport, exitCodeFor, summariseWarnings } from '../../src/core/report.js';
import { markDone } from '../../src/core/store/overrides.js';
import { loadStore, saveStore, MISSING_FLAG } from '../../src/core/store/store.js';
import { fixedClock } from '../helpers/factory.js';
import { NOTES_DIR, copyFixturesToTemp } from '../helpers/fixtures.js';

let work: string;
let storeFile: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'at-ingest-'));
  storeFile = join(work, 'store', 'store.json');
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const run = (dir: string, extra = {}) =>
  ingest(dir, { store: storeFile, clock: fixedClock, ...extra });

describe('M9 acceptance on the sample folder', () => {
  it('ingests the whole folder and the report numbers match', async () => {
    const r = await run(NOTES_DIR);
    expect(r.filesScanned).toBe(35);
    expect(r.filesRead).toBe(33);
    expect(r.meetings).toBe(33);
    expect(r.skipped).toEqual([
      { file: '2026-09-09-notes-final-v2.md', reason: 'empty' },
      { file: 'scratch.md', reason: 'binary' },
    ]);
    expect(r.ignoredCandidates).toHaveLength(3);
    expect(r.items).toBe(96);
    expect(r.warningCounts).toEqual({ DATE_INFERRED: 1, DUE_UNRESOLVABLE: 1, OWNER_AMBIGUOUS: 7 });
    expect(r.counts).toEqual({ unassigned: 2, noDueDate: 23, ambiguousOwner: 7 });
    expect(r.uncertainMerges).toHaveLength(1);
    expect(exitCodeFor(r)).toBe(0);
  });

  it('keeps untitled.md items: not dropped, undated meeting', async () => {
    await run(NOTES_DIR);
    const s = loadStore(storeFile);
    const m = s.meetings.find((x) => x.sourceFile === 'untitled.md');
    expect(m).toMatchObject({ date: null, attendees: [] });
    const items = s.items.filter((i) => i.occurrences[0]?.sourceFile === 'untitled.md');
    expect(items.map((i) => i.task)).toEqual(['chase the vendor', 'send the slides']);
    expect(items.every((i) => i.due.date === null)).toBe(true);
    // "Friday" cannot be resolved without a meeting date; the text is kept
    expect(items[1]?.due).toMatchObject({ raw: 'Friday', reason: 'no-meeting-date' });
  });

  it('M8-100 ingest, save, load equals the in-memory result; stores last report', async () => {
    const r = await run(NOTES_DIR);
    const s = loadStore(storeFile);
    expect(s.lastIngest?.report).toEqual(JSON.parse(JSON.stringify(r)));
    expect(s.items).toHaveLength(r.items);
    expect(s.lastIngest?.at).toBe('2026-11-24T10:00:00.000Z');
  });

  it('M8-101 / acceptance 14: ingesting twice gives an identical store file', async () => {
    await run(NOTES_DIR);
    const a = readFileSync(storeFile, 'utf8');
    await run(NOTES_DIR);
    expect(readFileSync(storeFile, 'utf8')).toBe(a);
  });

  it('M8-102 / acceptance 10: a done mark survives a re-ingest', async () => {
    await run(NOTES_DIR);
    const quote = loadStore(storeFile).items.find((i) => /revised quote/.test(i.task));
    const open = loadStore(storeFile).items.find((i) => i.status === 'open');
    expect(open).toBeDefined();
    const r = markDone(loadStore(storeFile), (open as { id: string }).id, fixedClock);
    saveStore(storeFile, r.store);
    await run(NOTES_DIR);
    const after = loadStore(storeFile).items.find((i) => i.id === open?.id);
    expect(after).toMatchObject({ status: 'done', doneBy: 'cli' });
    expect(quote?.status).toBe('done'); // done in the notes, untouched
  });

  it('M8-103 editing one file changes only that file’s items', async () => {
    const dir = copyFixturesToTemp();
    await run(dir);
    const before = loadStore(storeFile);
    appendFileSync(join(dir, '2026-09-02-standup.md'), '\n- [ ] Sam: order new monitors\n');
    await run(dir);
    const after = loadStore(storeFile);
    const added = after.items.filter((i) => !before.items.some((b) => b.id === i.id));
    expect(added.map((i) => i.task)).toEqual(['order new monitors']);
    for (const b of before.items) expect(after.items.find((i) => i.id === b.id)).toEqual(b);
    rmSync(dir, { recursive: true, force: true });
  });

  it('M8-104 removing a line keeps the item and flags it', async () => {
    const dir = copyFixturesToTemp();
    await run(dir);
    const file = join(dir, '2026-09-02-standup.md');
    const lines = readFileSync(file, 'utf8').split('\n');
    const idx = lines.findIndex((l) => /^\s*[-*]\s+\[[ xX]\]/.test(l));
    expect(idx).toBeGreaterThan(-1);
    lines.splice(idx, 1);
    writeFileSync(file, lines.join('\n'));
    await run(dir);
    const s = loadStore(storeFile);
    const flagged = s.items.filter((i) => i.flags.includes(MISSING_FLAG));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.occurrences.every((o) => o.missing === true)).toBe(true);
    expect(s.items).toHaveLength(96); // nothing deleted
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('M9 failure handling', () => {
  it('a missing folder throws FolderError and writes nothing', async () => {
    await expect(run(join(work, 'nope'))).rejects.toBeInstanceOf(FolderError);
  });

  it('a folder with only bad files: all skipped, no items, no throw', async () => {
    const dir = join(work, 'bad');
    mkdirSync(dir);
    writeFileSync(join(dir, 'empty.md'), '');
    writeFileSync(join(dir, 'bin.md'), Buffer.from([0, 1, 2, 0, 255, 0]));
    const r = await run(dir);
    expect(r.items).toBe(0);
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(['binary', 'empty']);
    expect(exitCodeFor(r)).toBe(0);
  });

  it('header but no actions: meeting kept, skipped with no-actions', async () => {
    const dir = join(work, 'na');
    mkdirSync(dir);
    writeFileSync(
      join(dir, '2026-09-01-chat.md'),
      '# Chat\nDate: 2026-09-01\nAttendees: Sam Okafor\n\nJust talk.\n',
    );
    const r = await run(dir);
    expect(r.meetings).toBe(1);
    expect(r.items).toBe(0);
    expect(r.skipped).toContainEqual({ file: '2026-09-01-chat.md', reason: 'no-actions' });
  });

  it('a stage that throws on one file skips it as unreadable and continues', async () => {
    const dir = join(work, 'boom');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.md'), '# A\nDate: 2026-09-01\n\n- [ ] Sam: fine\n');
    writeFileSync(join(dir, 'b.md'), '# B\nDate: 2026-09-02\n\n- [ ] Sam: explode\n');
    const r = await run(dir, {
      stages: {
        parseLine: (c: Parameters<typeof realParse>[0]) => {
          if (c.rawLine.includes('explode')) throw new Error('kaboom');
          return realParse(c);
        },
      },
    });
    expect(r.skipped).toEqual([{ file: 'b.md', reason: 'unreadable', message: 'kaboom' }]);
    expect(r.items).toBe(1);
  });

  it('a corrupt store stops the run and is left untouched', async () => {
    mkdirSync(join(work, 'store'));
    writeFileSync(storeFile, '{ "items": [');
    await expect(run(NOTES_DIR)).rejects.toBeInstanceOf(StoreError);
    expect(readFileSync(storeFile, 'utf8')).toBe('{ "items": [');
  });

  it('M8-105 a corrupt store also stops list-style loads', () => {
    mkdirSync(join(work, 'store'));
    writeFileSync(storeFile, 'nope');
    expect(() => loadStore(storeFile)).toThrow(StoreError);
  });
});

describe('M9 property tests', () => {
  it('random byte files never throw, and give the same result in any order', async () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const dir = join(work, 'fuzz');
    mkdirSync(dir);
    for (let i = 0; i < 25; i++) {
      const n = Math.floor(rnd() * 300);
      const bytes = Buffer.alloc(n);
      for (let j = 0; j < n; j++) bytes[j] = Math.floor(rnd() * 256);
      writeFileSync(join(dir, `f${i}.md`), bytes);
    }
    writeFileSync(join(dir, 'ok.md'), '# Ok\nDate: 2026-09-01\n\n- [ ] Sam: real task\n');
    const r1 = await run(dir);
    const a = readFileSync(storeFile, 'utf8');
    rmSync(storeFile);
    const r2 = await run(dir);
    expect(r2).toEqual(r1);
    expect(readFileSync(storeFile, 'utf8')).toBe(a);
    expect(r1.items).toBeGreaterThanOrEqual(1);
  });

  it('a copy of the folder elsewhere gives the same store', async () => {
    await run(NOTES_DIR);
    const a = readFileSync(storeFile, 'utf8');
    const copy = copyFixturesToTemp();
    rmSync(storeFile);
    await run(copy);
    expect(readFileSync(storeFile, 'utf8')).toBe(a);
    rmSync(copy, { recursive: true, force: true });
  });
});

describe('report builder', () => {
  it('summariseWarnings counts per code in alphabetical order', () => {
    const w = (code: string) => ({ file: 'f', code, message: 'm' });
    expect(summariseWarnings([w('B'), w('A'), w('B')])).toEqual({ A: 1, B: 2 });
    expect(Object.keys(summariseWarnings([w('B'), w('A')]))).toEqual(['A', 'B']);
  });
  it('buildReport output survives JSON round trip', () => {
    const r = buildReport({
      filesScanned: 1,
      filesRead: 1,
      meetings: 1,
      items: [],
      skipped: [],
      warnings: [],
      uncertainMerges: [],
      ignoredCandidates: [],
    });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
