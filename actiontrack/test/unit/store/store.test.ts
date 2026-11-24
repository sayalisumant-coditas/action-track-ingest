import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AmbiguousIdError,
  InvalidIdError,
  StoreError,
  UnknownIdError,
} from '../../../src/core/errors.js';
import { applyOverrides, markDone, resolveId } from '../../../src/core/store/overrides.js';
import { DEFAULT_STORE_PATH, resolveStorePath } from '../../../src/core/store/paths.js';
import {
  MISSING_FLAG,
  applyIngest,
  emptyStore,
  getDraft,
  loadStore,
  migrate,
  nodeIO,
  recordDraft,
  saveStore,
  type Store,
  type StoreIO,
} from '../../../src/core/store/store.js';
import {
  FIXED_NOW,
  ambiguousOwner,
  due,
  emptyReport,
  fixedClock,
  item,
  meeting,
  unassignedOwner,
} from '../../helpers/factory.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'at-store-'));
  file = join(dir, 'store.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const occ = (sourceFile: string, line: number, rawLine: string, meetingId = sourceFile) => ({
  meetingId,
  sourceFile,
  line,
  checked: false,
  due: due(null),
  rawLine,
});

describe('A. emptyStore, loadStore', () => {
  it('M8-01 emptyStore', () => {
    expect(emptyStore()).toEqual({
      version: 1,
      meetings: [],
      items: [],
      overrides: {},
      drafts: {},
    });
  });
  it('M8-02 missing file gives an empty store and creates nothing', () => {
    expect(loadStore(file)).toEqual(emptyStore());
    expect(existsSync(file)).toBe(false);
  });
  it('M8-03 valid store loads as saved', () => {
    const s = { ...emptyStore(), meetings: [meeting()], items: [item({ id: 'aaaaaa' })] };
    saveStore(file, s);
    expect(loadStore(file)).toEqual(s);
  });
  it.each([
    ['M8-04 invalid JSON', '{ "items": ['],
    ['M8-05 empty file', ''],
    ['M8-07 missing version', '{"meetings":[],"items":[],"overrides":{},"drafts":{}}'],
    ['M8-08 wrong shape', '{"version":1,"meetings":[],"items":{},"overrides":{},"drafts":{}}'],
  ])('%s throws StoreError naming the file', (_n, text) => {
    writeFileSync(file, text);
    expect(() => loadStore(file)).toThrow(StoreError);
    expect(() => loadStore(file)).toThrow(file);
  });
  it('M8-06 unknown version names the version', () => {
    writeFileSync(file, '{"version":99}');
    expect(() => loadStore(file)).toThrow(/99/);
  });
  it('M8-09 a corrupt file is never modified', () => {
    writeFileSync(file, '{ "items": [');
    const before = statSync(file);
    expect(() => loadStore(file)).toThrow(StoreError);
    const after = statSync(file);
    expect(readFileSync(file, 'utf8')).toBe('{ "items": [');
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
  it('M8-11 a directory in place of the file throws StoreError', () => {
    mkdirSync(file);
    expect(() => loadStore(file)).toThrow(StoreError);
  });
  it('M8-12 migrate leaves a v1 store unchanged', () => {
    const s = emptyStore();
    expect(migrate(s)).toBe(s);
    expect(() => migrate({ version: 2 })).toThrow(StoreError);
  });
  it('M8-13 a BOM is accepted', () => {
    writeFileSync(file, '\ufeff' + JSON.stringify(emptyStore()));
    expect(loadStore(file)).toEqual(emptyStore());
  });
});

describe('B. saveStore', () => {
  it('M8-20 round trip, M8-31 unicode', () => {
    const s = {
      ...emptyStore(),
      items: [item({ id: 'aaaaaa', task: 'send café ☕ menu — 日本語' })],
    };
    saveStore(file, s);
    expect(loadStore(file)).toEqual(s);
  });
  it('M8-21/22 creates missing folders, three levels deep', () => {
    const deep = join(dir, 'a', 'b', 'c', 'store.json');
    saveStore(deep, emptyStore());
    expect(existsSync(deep)).toBe(true);
  });
  it('M8-23 two-space indent, stable bytes, final newline', () => {
    const s = { ...emptyStore(), items: [item({ id: 'aaaaaa' })], meetings: [meeting()] };
    saveStore(file, s);
    const a = readFileSync(file, 'utf8');
    saveStore(file, JSON.parse(a) as Store);
    expect(readFileSync(file, 'utf8')).toBe(a);
    expect(a).toMatch(/^\{\n {2}"version": 1,/);
    expect(a.endsWith('}\n')).toBe(true);
  });
  it('M8-24 items saved in (meeting date, file, line) order, undated last', () => {
    const ms = [
      meeting({ id: 'm-b', sourceFile: 'b.md', date: '2026-09-02' }),
      meeting({ id: 'm-a', sourceFile: 'a.md', date: '2026-09-01' }),
      meeting({ id: 'm-u', sourceFile: 'u.md', date: null }),
    ];
    const mk = (id: string, m: string, f: string, line: number) =>
      item({ id, occurrences: [occ(f, line, `- [ ] ${id}`, m)] });
    const s = {
      ...emptyStore(),
      meetings: ms,
      items: [
        mk('u1', 'm-u', 'u.md', 1),
        mk('b1', 'm-b', 'b.md', 1),
        mk('a2', 'm-a', 'a.md', 9),
        mk('a1', 'm-a', 'a.md', 2),
      ],
    };
    saveStore(file, s);
    expect(loadStore(file).items.map((i) => i.id)).toEqual(['a1', 'a2', 'b1', 'u1']);
  });

  it('M8-25 writes a temp file in the same folder, then renames', () => {
    const calls: string[] = [];
    const io: StoreIO = {
      ...nodeIO,
      writeFile: (f, d) => (calls.push(`write ${f}`), nodeIO.writeFile(f, d)),
      rename: (a, b) => (calls.push(`rename ${a} -> ${b}`), nodeIO.rename(a, b)),
    };
    saveStore(file, emptyStore(), io);
    expect(calls).toHaveLength(2);
    const tmp = (calls[0] as string).replace('write ', '');
    expect(tmp.startsWith(dir)).toBe(true);
    expect(tmp).not.toBe(file);
    expect(calls[1]).toBe(`rename ${tmp} -> ${file}`);
  });
  it('M8-26 a crash between temp write and rename leaves the old store intact', () => {
    const old = { ...emptyStore(), items: [item({ id: 'aaaaaa' })] };
    saveStore(file, old);
    const before = readFileSync(file, 'utf8');
    const crash: StoreIO = {
      ...nodeIO,
      rename: () => {
        throw new Error('crash');
      },
      copyFile: () => {
        throw new Error('crash');
      },
    };
    expect(() => saveStore(file, { ...old, items: [] }, crash)).toThrow(StoreError);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(loadStore(file)).toEqual(old);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
  it('M8-27 a leftover temp file does not break the next save', () => {
    writeFileSync(join(dir, '.store.json.1.1.tmp'), 'half');
    saveStore(file, emptyStore());
    expect(loadStore(file)).toEqual(emptyStore());
  });
  it('M8-28 saving over an existing store works', () => {
    saveStore(file, emptyStore());
    const s = { ...emptyStore(), items: [item({ id: 'aaaaaa' })] };
    saveStore(file, s);
    expect(loadStore(file)).toEqual(s);
  });
  it('M8-29 refused rename falls back to copy + unlink and removes the temp file', () => {
    let copied = false;
    const io: StoreIO = {
      ...nodeIO,
      rename: () => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      },
      copyFile: (a, b) => ((copied = true), nodeIO.copyFile(a, b)),
    };
    const s = { ...emptyStore(), items: [item({ id: 'aaaaaa' })] };
    saveStore(file, s, io);
    expect(copied).toBe(true);
    expect(loadStore(file)).toEqual(s);
    expect(readdirSync(dir)).toEqual(['store.json']);
  });
  it('M8-30 a write failure throws StoreError and keeps the old file', () => {
    saveStore(file, emptyStore());
    const before = readFileSync(file, 'utf8');
    const io: StoreIO = {
      ...nodeIO,
      writeFile: () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      },
    };
    expect(() => saveStore(file, emptyStore(), io)).toThrow(/cannot write store.*EACCES/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it('M8-32 5,000 items save in under a second', () => {
    const items = Array.from({ length: 5000 }, (_, i) =>
      item({ id: i.toString(16).padStart(6, '0') }),
    );
    const t = performance.now();
    saveStore(file, { ...emptyStore(), items });
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('C. paths', () => {
  const cwd = join(tmpdir(), 'proj');
  it('M8-40 default', () => {
    expect(resolveStorePath({ env: {}, cwd })).toBe(join(cwd, DEFAULT_STORE_PATH));
  });
  it('M8-41 env', () => {
    expect(resolveStorePath({ env: { ACTIONTRACK_STORE: 'x/s.json' }, cwd })).toBe(
      join(cwd, 'x', 's.json'),
    );
  });
  it('M8-42 flag beats env', () => {
    expect(resolveStorePath({ flag: 'f.json', env: { ACTIONTRACK_STORE: 'e.json' }, cwd })).toBe(
      join(cwd, 'f.json'),
    );
  });
  it('M8-43 relative paths resolve against cwd; blank values are ignored', () => {
    expect(resolveStorePath({ flag: '  ', env: { ACTIONTRACK_STORE: '' }, cwd })).toBe(
      join(cwd, DEFAULT_STORE_PATH),
    );
    expect(resolveStorePath({ flag: './a/../s.json', env: {}, cwd })).toBe(join(cwd, 's.json'));
  });
  it('M8-44 spaces', () => {
    expect(resolveStorePath({ flag: 'my notes/store.json', env: {}, cwd })).toBe(
      join(cwd, 'my notes', 'store.json'),
    );
  });
});

describe('D. applyIngest', () => {
  const clock = fixedClock;
  const mA = meeting({ id: 'a', sourceFile: 'a.md', date: '2026-09-01' });
  const mB = meeting({ id: 'b', sourceFile: 'b.md', date: '2026-09-02' });
  const iA = item({
    id: 'aa0001',
    task: 'task a',
    occurrences: [occ('a.md', 3, '- [ ] Priya: task a', 'a')],
  });
  const iB = item({
    id: 'bb0001',
    task: 'task b',
    occurrences: [occ('b.md', 3, '- [ ] Karan: task b', 'b')],
  });

  it('M8-50/62 first ingest fills everything, lastIngest has clock and report', () => {
    const rep = { ...emptyReport(), items: 2 };
    const s = applyIngest(emptyStore(), [mA, mB], [iA, iB], rep, clock);
    expect(s.items.map((i) => i.id)).toEqual(['aa0001', 'bb0001']);
    expect(s.meetings).toHaveLength(2);
    expect(s.lastIngest).toEqual({ at: FIXED_NOW, report: rep });
  });
  it('M8-51/52/53 ingesting the same data twice is identical', () => {
    const once = applyIngest(emptyStore(), [mA, mB], [iA, iB], emptyReport(), clock);
    const twice = applyIngest(once, [mA, mB], [iA, iB], emptyReport(), clock);
    expect(twice).toEqual(once);
  });
  it('M8-54/55 changed text updates only that item', () => {
    const base = applyIngest(emptyStore(), [mA, mB], [iA, iB], emptyReport(), clock);
    const edited = {
      ...iA,
      id: 'aa0002',
      task: 'task a, edited',
      occurrences: [occ('a.md', 3, '- [ ] Priya: task a edited', 'a')],
    };
    const s = applyIngest(base, [mA, mB], [edited, iB], emptyReport(), clock);
    expect(s.items.map((i) => i.id).sort()).toEqual(['aa0002', 'bb0001']);
    expect(s.items.find((i) => i.id === 'bb0001')).toEqual(iB);
    expect(s.items.some((i) => i.flags.includes(MISSING_FLAG))).toBe(false);
  });
  it('M8-56 a removed line is kept and flagged, not deleted', () => {
    const base = applyIngest(emptyStore(), [mA, mB], [iA, iB], emptyReport(), clock);
    const s = applyIngest(base, [mA, mB], [iB], emptyReport(), clock);
    const gone = s.items.find((i) => i.id === 'aa0001');
    expect(gone?.flags).toContain(MISSING_FLAG);
    expect(gone?.occurrences[0]?.missing).toBe(true);
  });
  it('M8-57 an item that comes back loses the flag', () => {
    const base = applyIngest(emptyStore(), [mA, mB], [iA, iB], emptyReport(), clock);
    const gone = applyIngest(base, [mA, mB], [iB], emptyReport(), clock);
    const back = applyIngest(gone, [mA, mB], [iA, iB], emptyReport(), clock);
    const it1 = back.items.find((i) => i.id === 'aa0001');
    expect(it1?.flags).toEqual([]);
    expect(it1?.occurrences[0]?.missing).toBeUndefined();
  });
  it('M8-58 a whole file removed from the folder flags its items', () => {
    const base = applyIngest(emptyStore(), [mA, mB], [iA, iB], emptyReport(), clock);
    const s = applyIngest(base, [mB], [iB], emptyReport(), clock);
    expect(s.items.find((i) => i.id === 'aa0001')?.flags).toContain(MISSING_FLAG);
    expect(s.items).toHaveLength(2);
  });
  it('M8-59 one occurrence of a merged item removed: item kept, that occurrence missing', () => {
    const merged = item({
      id: 'cc0001',
      occurrences: [
        occ('a.md', 3, '- [ ] Priya: send quote', 'a'),
        occ('b.md', 4, '- [ ] Priya: send quote', 'b'),
      ],
    });
    const base = applyIngest(emptyStore(), [mA, mB], [merged], emptyReport(), clock);
    const fresh = {
      ...merged,
      occurrences: [merged.occurrences[0] as (typeof merged.occurrences)[0]],
    };
    const s = applyIngest(base, [mA, mB], [fresh], emptyReport(), clock);
    const it1 = s.items[0];
    expect(it1?.flags).not.toContain(MISSING_FLAG);
    expect(it1?.occurrences.map((o) => !!o.missing)).toEqual([false, true]);
  });
  it('M8-60 a new file adds items and leaves old ones', () => {
    const base = applyIngest(emptyStore(), [mA], [iA], emptyReport(), clock);
    const s = applyIngest(base, [mA, mB], [iA, iB], emptyReport(), clock);
    expect(s.items.map((i) => i.id)).toEqual(['aa0001', 'bb0001']);
    expect(s.items[0]).toEqual(iA);
  });
  it('M8-61/93 overrides and drafts are untouched', () => {
    let s = applyIngest(emptyStore(), [mA], [iA], emptyReport(), clock);
    s = recordDraft(markDone(s, 'aa0001', clock).store, 'priya-nair', 'd1', clock);
    const next = applyIngest(s, [mA], [iA], emptyReport(), clock);
    expect(next.overrides).toEqual(s.overrides);
    expect(next.drafts).toEqual(s.drafts);
  });
  it('M8-63 mergeFolders keeps items from files outside the ingest, unflagged', () => {
    const base = applyIngest(emptyStore(), [mA, mB], [iA, iB], emptyReport(), clock);
    const s = applyIngest(base, [mB], [iB], emptyReport(), clock, { mergeFolders: true });
    expect(s.items.find((i) => i.id === 'aa0001')).toEqual(iA);
    expect(s.meetings.map((m) => m.sourceFile)).toEqual(['a.md', 'b.md']);
  });
  it('M8-64 an empty ingest keeps existing items', () => {
    const base = applyIngest(emptyStore(), [mA], [iA], emptyReport(), clock);
    const s = applyIngest(base, [], [], emptyReport(), clock);
    expect(s.items).toEqual(base.items);
    expect(s.meetings).toEqual(base.meetings);
  });
  it('M8-65/66/67 ambiguous, unassigned, undated items and meetings survive a save and load', () => {
    const undated = meeting({ id: 'u', sourceFile: 'u.md', date: null });
    const items = [
      item({
        id: 'a00001',
        owner: ambiguousOwner('priya-nair', 'priya-shah'),
        occurrences: [occ('a.md', 1, '- [ ] Priya: x', 'a')],
      }),
      item({
        id: 'b00001',
        owner: unassignedOwner(),
        due: due(null, null),
        occurrences: [occ('u.md', 1, '- [ ] y', 'u')],
      }),
    ];
    const s = applyIngest(emptyStore(), [mA, undated], items, emptyReport(), clock);
    saveStore(file, s);
    const back = loadStore(file);
    expect(back).toEqual(s);
    expect(back.items.find((i) => i.id === 'a00001')?.owner).toMatchObject({
      kind: 'ambiguous',
      candidates: ['priya-nair', 'priya-shah'],
    });
    expect(back.items.find((i) => i.id === 'b00001')?.due.date).toBeNull();
    expect(back.meetings.find((m) => m.id === 'u')?.date).toBeNull();
  });
  it('is pure: the input store is not modified', () => {
    const base = applyIngest(emptyStore(), [mA], [iA], emptyReport(), clock);
    const snap = JSON.stringify(base);
    applyIngest(base, [mB], [iB], emptyReport(), clock);
    expect(JSON.stringify(base)).toBe(snap);
  });
});

describe('E. applyOverrides and markDone', () => {
  const clock = fixedClock;
  const store = (): Store => ({
    ...emptyStore(),
    items: [
      item({ id: 'a3f001' }),
      item({ id: 'a3f002' }),
      item({ id: 'b10001' }),
      item({ id: 'c20001', status: 'done', doneBy: 'notes', doneAt: '2026-09-15' }),
    ],
  });

  it('M8-70 marks an open item done with the clock time', () => {
    const r = markDone(store(), 'b10001', clock);
    expect(r.changed).toBe(true);
    expect(r.store.overrides['b10001']).toEqual({ status: 'done', doneAt: FIXED_NOW });
    expect(r.item).toMatchObject({ status: 'done', doneBy: 'cli', doneAt: FIXED_NOW });
  });
  it('M8-71 twice: second is a no-op and keeps doneAt', () => {
    const r1 = markDone(store(), 'b10001', clock);
    const r2 = markDone(r1.store, 'b10001', () => new Date('2027-01-01T00:00:00Z'));
    expect(r2.changed).toBe(false);
    expect(r2.store.overrides['b10001']?.doneAt).toBe(FIXED_NOW);
  });
  it('M8-72 a done override survives a re-ingest where the notes still show [ ]', () => {
    const m = meeting({ id: 'a', sourceFile: 'a.md' });
    const i = item({ id: 'aa0001', occurrences: [occ('a.md', 3, '- [ ] Priya: x', 'a')] });
    let s = applyIngest(emptyStore(), [m], [i], emptyReport(), clock);
    s = markDone(s, 'aa0001', clock).store;
    s = applyIngest(s, [m], [i], emptyReport(), clock);
    expect(s.items[0]).toMatchObject({ status: 'done', doneBy: 'cli' });
  });
  it('M8-73 an item the notes show done: changed=false, no override added', () => {
    const r = markDone(store(), 'c20001', clock);
    expect(r.changed).toBe(false);
    expect(r.store.overrides).toEqual({});
    expect(r.item.doneBy).toBe('notes');
  });
  it('M8-74 a merged item is done as a whole', () => {
    const merged = item({ id: 'dd0001', occurrences: [occ('a.md', 1, 'x'), occ('b.md', 1, 'x')] });
    const r = markDone({ ...emptyStore(), items: [merged] }, 'dd0001', clock);
    expect(r.item.occurrences).toHaveLength(2);
    expect(r.item.status).toBe('done');
  });
  it('M8-75 a missing-from-notes item stays done', () => {
    const flagged = item({ id: 'ee0001', flags: [MISSING_FLAG] });
    const s = markDone({ ...emptyStore(), items: [flagged] }, 'ee0001', clock).store;
    expect(applyOverrides(s.items, s.overrides)[0]).toMatchObject({
      status: 'done',
      flags: [MISSING_FLAG],
    });
  });
  it('M8-77 unknown id; M8-82 empty id', () => {
    expect(() => markDone(store(), 'zzzzzz', clock)).toThrow(UnknownIdError);
    expect(() => markDone(store(), '', clock)).toThrow(UnknownIdError);
    expect(() => markDone(store(), '   ', clock)).toThrow(UnknownIdError);
  });
  it('M8-78 a unique prefix resolves; M8-81 upper case matches', () => {
    expect(resolveId(store().items, 'b1')).toBe('b10001');
    expect(resolveId(store().items, 'B10')).toBe('b10001');
  });
  it('M8-79 an ambiguous prefix lists both ids', () => {
    let err: unknown;
    try {
      resolveId(store().items, 'a3f');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AmbiguousIdError);
    expect((err as Error).message).toMatch(/a3f001.*a3f002/);
  });
  it('M8-80 a one-character prefix is rejected', () => {
    expect(() => resolveId(store().items, 'a')).toThrow(InvalidIdError);
  });
  it('M8-83 an override for a missing id is ignored on read and kept in the file', () => {
    const s: Store = { ...store(), overrides: { ffffff: { status: 'done', doneAt: FIXED_NOW } } };
    expect(applyOverrides(s.items, s.overrides)).toEqual(s.items);
    saveStore(file, s);
    expect(loadStore(file).overrides).toHaveProperty('ffffff');
  });
  it('M8-84 applyOverrides is pure', () => {
    const s = markDone(store(), 'b10001', clock).store;
    const snap = JSON.stringify(s.items);
    applyOverrides(s.items, s.overrides);
    expect(JSON.stringify(s.items)).toBe(snap);
  });
  it('M8-86 an override never touches an item the notes show done', () => {
    const s = store();
    const out = applyOverrides(s.items, { c20001: { status: 'done', doneAt: 'x' } });
    expect(out.find((i) => i.id === 'c20001')).toMatchObject({ status: 'done', doneBy: 'notes' });
  });
});

describe('F. drafts', () => {
  const clock = fixedClock;
  it('M8-90 recordDraft stores id and clock time', () => {
    const s = recordDraft(emptyStore(), 'priya-nair', 'd1', clock);
    expect(s.drafts['priya-nair']).toEqual({ draftId: 'd1', createdAt: FIXED_NOW });
  });
  it('M8-91 getDraft of an unknown person is undefined (also for prototype names)', () => {
    expect(getDraft(emptyStore(), 'nobody')).toBeUndefined();
    expect(getDraft(emptyStore(), 'constructor')).toBeUndefined();
  });
  it('M8-92 recording twice replaces', () => {
    let s = recordDraft(emptyStore(), 'priya-nair', 'd1', clock);
    s = recordDraft(s, 'priya-nair', 'd2', clock);
    expect(getDraft(s, 'priya-nair')?.draftId).toBe('d2');
    expect(Object.keys(s.drafts)).toHaveLength(1);
  });
  it('M8-94 no draft can be recorded for an ambiguous owner id', () => {
    expect(() => recordDraft(emptyStore(), '?priya', 'd1', clock)).toThrow(StoreError);
    expect(() => recordDraft(emptyStore(), '', 'd1', clock)).toThrow(StoreError);
  });
});

describe('M8-33 grep: only saveStore writes the store', () => {
  it('no other source file calls writeFile on a store path', () => {
    const src = join(__dirname, '../../../src');
    const hits: string[] = [];
    for (const rel of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
      if (!rel.endsWith('.ts')) continue;
      const text = readFileSync(join(src, rel), 'utf8');
      if (/writeFile(Sync)?\(/.test(text)) hits.push(rel.split('\\').join('/'));
    }
    // store.ts (the atomic writer) and fileGmail.ts (mock drafts, not the store) only
    expect(hits.sort()).toEqual(['core/followup/fileGmail.ts', 'core/store/store.ts']);
  });
});
