import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AmbiguousOwnerError, UsageError } from '../../../src/core/errors.js';
import { ingest } from '../../../src/core/ingest.js';
import {
  directoryOf,
  itemsOf,
  parseFilters,
  queryItems,
  queryWithNotices,
  type QueryFilters,
} from '../../../src/core/query/list.js';
import { daysOverdue, effectiveStatus, isOverdue } from '../../../src/core/query/status.js';
import { markDone } from '../../../src/core/store/overrides.js';
import { MISSING_FLAG, loadStore } from '../../../src/core/store/store.js';
import type { ActionItem } from '../../../src/core/types.js';
import {
  ambiguousOwner,
  due,
  fixedClock,
  groupOwner,
  item,
  meeting,
  owner,
  unassignedOwner,
} from '../../helpers/factory.js';
import { NOTES_DIR } from '../../helpers/fixtures.js';
import { buildDirectory } from '../../../src/core/people/directory.js';

const ASOF = '2026-10-15';
const dir = buildDirectory([
  meeting({
    attendees: [
      'Priya Nair',
      'Priya Shah',
      'Karan Joshi',
      'Sam Okafor',
      'Anita Desai',
      'Rahul Mehta',
      'Rahul Verma',
      'Lena Fischer',
    ],
  }),
]);

const a: Record<string, ActionItem> = {
  a1: item({ id: 'a1', owner: owner('priya-shah'), due: due('2026-10-01') }),
  a2: item({ id: 'a2', owner: owner('priya-nair'), due: due('2026-10-20') }),
  a3: item({ id: 'a3', owner: owner('karan-joshi'), due: due('2026-10-15') }),
  a4: item({ id: 'a4', owner: owner('karan-joshi'), due: due(null, null) }),
  a5: item({ id: 'a5', owner: owner('sam-okafor'), due: due('2026-09-10'), status: 'done' }),
  a6: item({ id: 'a6', owner: unassignedOwner(), due: due('2026-10-01') }),
  a7: item({ id: 'a7', owner: unassignedOwner(), due: due(null, null) }),
  a8: item({ id: 'a8', owner: groupOwner(), due: due('2026-10-07') }),
  a9: item({
    id: 'a9',
    owner: ambiguousOwner('priya-nair', 'priya-shah'),
    due: due('2026-10-05'),
  }),
  a10: item({ id: 'a10', owner: owner('anita-desai', 'rahul-mehta'), due: due('2026-10-10') }),
};
const all = Object.values(a);
const ids = (r: { id: string }[]) => r.map((i) => i.id);
const q = (f: QueryFilters, items = all) => ids(queryItems(items, f, dir, ASOF));
const sorted = (x: string[]) => [...x].sort();
const A = (...n: number[]) => n.map((i) => `a${i}`);

describe('M10 A. status helpers', () => {
  it('M10-01 a1 overdue', () => expect(effectiveStatus(a.a1 as ActionItem, ASOF)).toBe('overdue'));
  it('M10-02 a2 open', () => expect(effectiveStatus(a.a2 as ActionItem, ASOF)).toBe('open'));
  it('M10-03 due equal to as-of is open', () =>
    expect(effectiveStatus(a.a3 as ActionItem, ASOF)).toBe('open'));
  it('M10-04 no due date: open, never overdue', () => {
    expect(effectiveStatus(a.a4 as ActionItem, ASOF)).toBe('open');
    expect(isOverdue(a.a4 as ActionItem, ASOF)).toBe(false);
  });
  it('M10-05 done beats overdue', () =>
    expect(effectiveStatus(a.a5 as ActionItem, ASOF)).toBe('done'));
  it('M10-06 no owner and no due is open', () =>
    expect(effectiveStatus(a.a7 as ActionItem, ASOF)).toBe('open'));
  it('M10-07 isOverdue with null date is false', () =>
    expect(isOverdue(item({ id: 'x', due: due(null, null) }), ASOF)).toBe(false));
  it('M10-08 daysOverdue(a1) = 14', () => expect(daysOverdue(a.a1 as ActionItem, ASOF)).toBe(14));
  it('M10-09 daysOverdue(a3) = 0', () => expect(daysOverdue(a.a3 as ActionItem, ASOF)).toBe(0));
  it('M10-10 daysOverdue is 0 for no-due, future and done items', () => {
    for (const k of ['a4', 'a2', 'a5']) expect(daysOverdue(a[k] as ActionItem, ASOF)).toBe(0);
  });
  it('M10-11 across a month boundary', () =>
    expect(daysOverdue(item({ id: 'x', due: due('2026-09-28') }), '2026-10-02')).toBe(4));
  it('M10-12 across a year boundary', () =>
    expect(daysOverdue(item({ id: 'x', due: due('2026-12-30') }), '2027-01-02')).toBe(3));
  it('M10-13 across DST change dates', () => {
    expect(daysOverdue(item({ id: 'x', due: due('2026-03-28') }), '2026-03-30')).toBe(2);
    expect(daysOverdue(item({ id: 'x', due: due('2026-10-31') }), '2026-11-02')).toBe(2);
  });
  it('M10-14 unresolved due (null date, raw kept) is not overdue', () => {
    const it = item({ id: 'x', due: due(null, 'by the end of the cutover') });
    expect(isOverdue(it, ASOF)).toBe(false);
    expect(effectiveStatus(it, ASOF)).toBe('open');
  });
});

describe('M10 B. status filter', () => {
  it('M10-20 default: every item not done', () =>
    expect(sorted(q({}))).toEqual(sorted(A(1, 2, 3, 4, 6, 7, 8, 9, 10))));
  it('M10-21 --status open is the same as default', () =>
    expect(q({ status: 'open' })).toEqual(q({})));
  it('M10-22 --status overdue', () =>
    expect(sorted(q({ status: 'overdue' }))).toEqual(sorted(A(1, 6, 8, 9, 10))));
  it('M10-23 overdue never has null-due items', () => {
    const r = q({ status: 'overdue' });
    expect(r).not.toContain('a4');
    expect(r).not.toContain('a7');
  });
  it('M10-24 overdue never has done items', () =>
    expect(q({ status: 'overdue' })).not.toContain('a5'));
  it('M10-25 --status done is a5 only', () => expect(q({ status: 'done' })).toEqual(['a5']));
  it('M10-26 --status nonsense: usage error listing valid values', () => {
    expect(() => parseFilters({ status: 'nonsense' }, fixedClock)).toThrow(UsageError);
    expect(() => parseFilters({ status: 'nonsense' }, fixedClock)).toThrow(/open, done, overdue/);
  });
  it('M10-27 --status OPEN accepted', () =>
    expect(parseFilters({ status: 'OPEN' }, fixedClock).filters.status).toBe('open'));
});

describe('M10 C. --due-before', () => {
  it('M10-30 --due-before 2026-10-15 is strict', () =>
    expect(sorted(q({ dueBefore: '2026-10-15' }))).toEqual(sorted(A(1, 6, 8, 9, 10))));
  it('M10-31 --due-before 2026-10-01 excludes items due exactly 10-01', () => {
    const r = q({ dueBefore: '2026-10-01' });
    expect(r).not.toContain('a1');
    expect(r).not.toContain('a6');
  });
  it('M10-32 null-due items always excluded', () => {
    const r = q({ dueBefore: '2099-01-01' });
    expect(r).not.toContain('a4');
    expect(r).not.toContain('a7');
  });
  it('M10-33 --due-before 2026-10-02 includes a1 and a6', () =>
    expect(sorted(q({ dueBefore: '2026-10-02' }))).toEqual(['a1', 'a6']));
  it('M10-34 combined with --status open is the AND of both', () =>
    expect(sorted(q({ dueBefore: '2026-10-08', status: 'open' }))).toEqual(sorted(A(1, 6, 8, 9))));
  it('M10-35 --status done with an earlier date: empty, no error', () =>
    expect(q({ dueBefore: '2026-09-01', status: 'done' })).toEqual([]));
  it.each([
    ['M10-36 2026-02-30', '2026-02-30'],
    ['M10-37a tomorrow', 'tomorrow'],
    ['M10-37b 10/10/2026', '10/10/2026'],
    ['M10-38 empty', ''],
  ])('%s is a usage error', (_n, v) => {
    expect(() => parseFilters({ dueBefore: v }, fixedClock)).toThrow(UsageError);
  });
  it('M10-39 default excludes done items even when the date matches', () =>
    expect(q({ dueBefore: '2026-10-01' })).not.toContain('a5'));
});

describe('M10 D. owner filter', () => {
  it('M10-40 "Priya Shah": her item plus the ambiguous one that lists her', () =>
    expect(sorted(q({ owner: 'Priya Shah' }))).toEqual(['a1', 'a9']));
  it('M10-41 case-insensitive', () =>
    expect(q({ owner: 'priya shah' })).toEqual(q({ owner: 'Priya Shah' })));
  it('M10-42 "Priya" throws naming both', () => {
    const run = () => q({ owner: 'Priya' });
    expect(run).toThrow(AmbiguousOwnerError);
    expect(run).toThrow(/Priya Nair/);
    expect(run).toThrow(/Priya Shah/);
    try {
      run();
    } catch (e) {
      expect(sorted((e as AmbiguousOwnerError).candidates)).toEqual(['Priya Nair', 'Priya Shah']);
    }
  });
  it('M10-43 "Rahul" throws naming Mehta and Verma', () => {
    expect(() => q({ owner: 'Rahul' })).toThrow(AmbiguousOwnerError);
    expect(() => q({ owner: 'Rahul' })).toThrow(/Rahul Mehta/);
    expect(() => q({ owner: 'Rahul' })).toThrow(/Rahul Verma/);
  });
  it('M10-44 unique first name Karan', () =>
    expect(sorted(q({ owner: 'Karan' }))).toEqual(['a3', 'a4']));
  it('M10-45 Anita matches the joint item', () => expect(q({ owner: 'Anita' })).toEqual(['a10']));
  it('M10-46 "Rahul Mehta" matches the joint item', () =>
    expect(q({ owner: 'Rahul Mehta' })).toEqual(['a10']));
  it('M10-47 none: unassigned items', () =>
    expect(sorted(q({ owner: 'none' }))).toEqual(['a6', 'a7']));
  it('M10-48 everyone: group items', () => expect(q({ owner: 'everyone' })).toEqual(['a8']));
  it('M10-49 nobody: empty with a notice', () => {
    const r = queryWithNotices(all, { owner: 'Zed' }, dir, ASOF);
    expect(r.items).toEqual([]);
    expect(r.notices).toEqual(['no such person: "Zed"']);
  });
  it('M10-50 ambiguous a9 shown for a candidate, and still marked ambiguous', () => {
    const r = queryItems(all, { owner: 'Priya Shah' }, dir, ASOF).find((i) => i.id === 'a9');
    expect(r?.owner.kind).toBe('ambiguous');
  });
  it('M10-51 ambiguous a9 not shown for Karan Joshi', () =>
    expect(q({ owner: 'Karan Joshi' })).not.toContain('a9'));
  it('M10-52 "Priya" resolves when only one Priya exists', () => {
    const one = buildDirectory([meeting({ attendees: ['Priya Nair', 'Karan Joshi'] })]);
    expect(ids(queryItems(all, { owner: 'Priya' }, one, ASOF))).toEqual(
      expect.arrayContaining(['a2', 'a9']),
    );
    expect(ids(queryItems(all, { owner: 'Priya' }, one, ASOF))).not.toContain('a1');
  });
  it('M10-53 "Priya N." is Priya Nair', () =>
    expect(sorted(q({ owner: 'Priya N.' }))).toEqual(['a2', 'a9']));
  it('M10-54 Karan + overdue is empty (a3 due = as-of)', () =>
    expect(q({ owner: 'Karan', status: 'overdue' })).toEqual([]));
  it('M10-55 a helper is not matched as owner', () => {
    const lena: ActionItem = item({
      id: 'l1',
      owner: { ...owner('lena-fischer'), helpers: ['priya-nair'] },
    });
    expect(q({ owner: 'Priya Nair' }, [lena])).toEqual([]);
    expect(q({ owner: 'Lena' }, [lena])).toEqual(['l1']);
  });
  it('M10-56 --owner "" is a usage error', () =>
    expect(() => parseFilters({ owner: '' }, fixedClock)).toThrow(UsageError));
});

describe('M10 E. sorting and determinism', () => {
  it('M10-60 overdue first, then due asc, nulls last', () =>
    expect(q({})).toEqual(['a1', 'a6', 'a9', 'a8', 'a10', 'a3', 'a2', 'a4', 'a7']));
  it('M10-61 within overdue, earliest due first', () =>
    expect(q({ status: 'overdue' })).toEqual(['a1', 'a6', 'a9', 'a8', 'a10']));
  it('M10-62 tie on due: owner name, then id', () => {
    const x = item({ id: 'b2', owner: owner('karan-joshi'), due: due('2026-10-20') });
    const y = item({ id: 'b1', owner: owner('karan-joshi'), due: due('2026-10-20') });
    const z = item({ id: 'b3', owner: owner('anita-desai'), due: due('2026-10-20') });
    expect(q({}, [x, y, z])).toEqual(['b3', 'b1', 'b2']);
  });
  it('M10-63 nulls last', () => expect(q({}).slice(-2)).toEqual(['a4', 'a7']));
  it('M10-64 same query twice is identical', () => expect(q({})).toEqual(q({})));
  it('M10-65 shuffled input gives identical output', () =>
    expect(q({}, [...all].reverse())).toEqual(q({})));
  it('M10-66 input is not mutated', () => {
    const snap = JSON.stringify(all);
    q({});
    expect(JSON.stringify(all)).toBe(snap);
  });
  it('M10-67 1,000 random items: stable order across shuffles', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const people = ['karan-joshi', 'anita-desai', 'sam-okafor', 'priya-nair'];
    const many = Array.from({ length: 1000 }, (_, i) =>
      item({
        id: i.toString(16).padStart(6, '0'),
        owner: owner(people[Math.floor(rnd() * 4)] as string),
        due:
          rnd() < 0.2
            ? due(null, null)
            : due(`2026-10-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`),
      }),
    );
    const base = q({}, many);
    for (let k = 0; k < 3; k++) {
      const sh = many
        .map((x) => ({ x, r: rnd() }))
        .sort((p, r) => p.r - r.r)
        .map((p) => p.x);
      expect(q({}, sh)).toEqual(base);
    }
  });
});

describe('M10 F. parseFilters', () => {
  it('M10-70 no args: defaults and asOf from the clock', () =>
    expect(parseFilters({}, fixedClock)).toEqual({ filters: {}, asOf: '2026-11-24' }));
  it('M10-71 --as-of overrides the clock', () =>
    expect(parseFilters({ asOf: ASOF }, fixedClock).asOf).toBe(ASOF));
  it('M10-72 --as-of nonsense is a usage error', () =>
    expect(() => parseFilters({ asOf: 'nonsense' }, fixedClock)).toThrow(/--as-of/));
  it('M10-73 different clocks move as-of; queryItems itself takes asOf as a parameter', () => {
    const c = () => new Date('2026-10-02T23:30:00.000Z');
    expect(parseFilters({}, c).asOf).toBe('2026-10-02');
    expect(ids(queryItems(all, { status: 'overdue' }, dir, '2026-10-02'))).toEqual(['a1', 'a6']);
  });
  it('M10-74 combined valid flags are all kept', () =>
    expect(
      parseFilters(
        { owner: 'Karan', status: 'done', dueBefore: '2026-10-01', asOf: ASOF },
        fixedClock,
      ),
    ).toEqual({
      filters: { owner: 'Karan', status: 'done', dueBefore: '2026-10-01' },
      asOf: ASOF,
    }));
  it('M10-75 bad values name their flag', () => {
    expect(() => parseFilters({ status: 'x' }, fixedClock)).toThrow(/--status/);
    expect(() => parseFilters({ dueBefore: 'x' }, fixedClock)).toThrow(/--due-before/);
    expect(() => parseFilters({ asOf: 'x' }, fixedClock)).toThrow(/--as-of/);
    expect(() => parseFilters({ owner: ' ' }, fixedClock)).toThrow(/--owner/);
  });
});

describe('M10 G. duplicates', () => {
  const occ = (n: number) => ({
    meetingId: `m${n}`,
    sourceFile: `f${n}.md`,
    line: 1,
    checked: false,
    due: due(null),
    rawLine: 'x',
  });
  it('M10-80 a merged item is listed once', () => {
    const m = item({ id: 'm00001', occurrences: [occ(1), occ(2), occ(3)] });
    expect(q({}, [m])).toEqual(['m00001']);
  });
  it('M10-81 done in the latest meeting: absent from default list', () =>
    expect(q({}, [item({ id: 'd1', status: 'done' })])).toEqual([]));
  it('M10-82 a CLI override makes it done and absent', () => {
    const store = {
      version: 1 as const,
      meetings: [],
      items: [item({ id: 'c00001' })],
      overrides: {},
      drafts: {},
    };
    const r = markDone(store, 'c00001', fixedClock).store;
    expect(q({}, itemsOf(r))).toEqual([]);
    expect(q({ status: 'done' }, itemsOf(r))).toEqual(['c00001']);
  });
  it('M10-83 missing-from-notes and open: still listed', () => {
    const r = queryItems([item({ id: 'g1', flags: [MISSING_FLAG] })], {}, dir, ASOF);
    expect(ids(r)).toEqual(['g1']);
    expect(r[0]?.flags).toContain(MISSING_FLAG);
  });
  it('M10-84 same task, two owners: one row each', () =>
    expect(
      q({}, [
        item({ id: 'p1', task: 'send quote', owner: owner('karan-joshi') }),
        item({ id: 'p2', task: 'send quote', owner: owner('anita-desai') }),
      ]),
    ).toHaveLength(2));
});

describe('M10 H. integration on the sample (--as-of 2026-10-15)', () => {
  let tmp: string;
  let items: ActionItem[];
  let d: ReturnType<typeof directoryOf>;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'at-m10-'));
    const file = join(tmp, 's.json');
    await ingest(NOTES_DIR, { store: file, clock: fixedClock });
    const store = loadStore(file);
    items = itemsOf(store);
    d = directoryOf(store);
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const run = (f: QueryFilters) => queryItems(items, f, d, ASOF);

  it('M10-90 --status overdue: no null-due, no done', () => {
    const r = run({ status: 'overdue' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.due.date !== null && i.status !== 'done')).toBe(true);
  });
  it('M10-91 --due-before 2026-10-01: no null-due; due exactly 10-01 excluded', () => {
    expect(items.some((i) => i.due.date === '2026-10-01' && i.status !== 'done')).toBe(true);
    const r = run({ dueBefore: '2026-10-01' });
    expect(r.every((i) => i.due.date !== null && i.due.date < '2026-10-01')).toBe(true);
  });
  it('M10-92 --owner Priya throws naming both', () => {
    expect(() => run({ owner: 'Priya' })).toThrow(/Priya Nair/);
    expect(() => run({ owner: 'Priya' })).toThrow(/Priya Shah/);
  });
  it('M10-93 "Priya Shah": her items plus ambiguous ones that list her', () => {
    const r = run({ owner: 'Priya Shah' });
    expect(r.length).toBeGreaterThan(0);
    for (const i of r) {
      const ok =
        i.owner.people.includes('priya-shah') ||
        (i.owner.kind === 'ambiguous' && i.owner.candidates.includes('priya-shah'));
      expect(ok).toBe(true);
    }
  });
  it('M10-94 --owner none has the CRM notes and design-system changelog items', () =>
    expect(
      run({ owner: 'none' })
        .map((i) => i.task)
        .sort(),
    ).toEqual(['update the CRM notes', 'write the design-system changelog']));
  it('M10-95 untitled.md items are kept; no due date', () => {
    const u = run({}).filter((i) => i.occurrences[0]?.sourceFile === 'untitled.md');
    expect(u.map((i) => i.task).sort()).toEqual(['chase the vendor', 'send the slides']);
    expect(u.every((i) => i.due.date === null)).toBe(true);
  });
  it('M10-96 quote-to-Acme is done: absent by default, present with --status done', () => {
    expect(run({}).some((i) => /revised quote to Acme/.test(i.task))).toBe(false);
    expect(run({ status: 'done' }).some((i) => /revised quote to Acme/.test(i.task))).toBe(true);
  });
  it('M10-97 wireframes: once, due 2026-09-24, overdue', () => {
    const w = run({ status: 'overdue' }).filter((i) => /share updated wireframes/.test(i.task));
    expect(w).toHaveLength(1);
    expect(w[0]?.due.date).toBe('2026-09-24');
  });
  it('M10-98 --owner everyone finds the offsite Q4 goals item', () => {
    const r = run({ owner: 'everyone' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.owner.kind === 'group')).toBe(true);
    expect(r.some((i) => i.occurrences[0]?.sourceFile === '2026-09-30-q4-offsite.md')).toBe(true);
  });
  it('M10-99 same query twice gives identical rows', () => expect(run({})).toEqual(run({})));
  it('M10-100 query modules: no fs, no Date.now, no clock import', () => {
    for (const f of ['list.ts', 'status.ts']) {
      const t = readFileSync(join(__dirname, '../../../src/core/query', f), 'utf8');
      expect(t).not.toMatch(/node:fs|Date\.now\(|new Date\(\s*\)/);
      expect(t).not.toMatch(/import[^;]*\bsystemClock\b/);
    }
  });
});
