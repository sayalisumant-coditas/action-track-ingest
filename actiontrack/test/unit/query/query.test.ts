import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AmbiguousOwnerError, UsageError } from '../../../src/core/errors.js';
import { ingest } from '../../../src/core/ingest.js';
import {
  directoryOf,
  itemsOf,
  parseFilters,
  queryItems,
  queryWithNotices,
} from '../../../src/core/query/list.js';
import { daysOverdue, effectiveStatus, isOverdue } from '../../../src/core/query/status.js';
import { loadStore } from '../../../src/core/store/store.js';
import {
  ambiguousOwner,
  due,
  fixedClock,
  groupOwner,
  item,
  owner,
  unassignedOwner,
} from '../../helpers/factory.js';
import { NOTES_DIR } from '../../helpers/fixtures.js';
import { sampleDirectory } from '../../helpers/people.js';

const ASOF = '2026-10-15';
const dir = sampleDirectory();

const items = [
  item({ id: '000001', owner: owner('priya-nair'), due: due('2026-10-01') }), // overdue
  item({ id: '000002', owner: owner('priya-shah'), due: due('2026-10-20') }),
  item({ id: '000003', owner: owner('karan-joshi'), due: due(null, null) }),
  item({ id: '000004', owner: unassignedOwner(), due: due('2026-09-01') }), // overdue
  item({ id: '000005', owner: groupOwner(), due: due('2026-10-15') }), // due today: not overdue
  item({
    id: '000006',
    owner: owner('priya-nair', 'karan-joshi'),
    due: due('2026-09-20'),
    status: 'done',
  }),
  item({ id: '000007', owner: ambiguousOwner('priya-nair', 'priya-shah'), due: due('2026-10-10') }),
];
const ids = (r: { id: string }[]) => r.map((i) => i.id);
const q = (f: Parameters<typeof queryItems>[1]) => ids(queryItems(items, f, dir, ASOF));

describe('status', () => {
  it('overdue is strictly before as-of; today is not overdue', () => {
    expect(isOverdue(items[4]!, ASOF)).toBe(false);
    expect(isOverdue(items[0]!, ASOF)).toBe(true);
  });
  it('no due date never overdue; done never overdue', () => {
    expect(isOverdue(items[2]!, ASOF)).toBe(false);
    expect(isOverdue(items[5]!, ASOF)).toBe(false);
    expect(effectiveStatus(items[5]!, ASOF)).toBe('done');
    expect(effectiveStatus(items[2]!, ASOF)).toBe('open');
    expect(effectiveStatus(items[0]!, ASOF)).toBe('overdue');
  });
  it('daysOverdue counts whole days', () => {
    expect(daysOverdue(items[0]!, ASOF)).toBe(14);
    expect(daysOverdue(items[4]!, ASOF)).toBe(0);
    expect(daysOverdue(item({ id: 'x', due: due('2026-03-27') }), '2026-03-30')).toBe(3); // DST week
  });
});

describe('filters', () => {
  it('default status: everything not done, overdue included', () => {
    expect(q({})).not.toContain('000006');
    expect(q({})).toHaveLength(6);
  });
  it('--status overdue: no null-due, no done items', () => {
    const r = q({ status: 'overdue' });
    expect(r.sort()).toEqual(['000001', '000004', '000007']);
  });
  it('--status done', () => {
    expect(q({ status: 'done' })).toEqual(['000006']);
  });
  it('--due-before is strict and excludes null due', () => {
    const r = q({ dueBefore: '2026-10-01' });
    expect(r).toEqual(['000004']); // 10-01 itself is excluded, null excluded, done excluded
  });
  it('--owner full name matches only that person (joint owners included)', () => {
    expect(q({ owner: 'Priya Nair' }).sort()).toEqual(['000001', '000007']);
    expect(q({ owner: 'Priya Nair', status: 'done' })).toEqual(['000006']);
  });
  it('--owner with a shared first name throws naming both', () => {
    expect(() => queryItems(items, { owner: 'Priya' }, dir, ASOF)).toThrow(AmbiguousOwnerError);
    expect(() => queryItems(items, { owner: 'Priya' }, dir, ASOF)).toThrow(
      /Priya Nair.*Priya Shah/,
    );
  });
  it('--owner "Priya N." resolves by initial', () => {
    expect(q({ owner: 'Priya N.' }).sort()).toEqual(['000001', '000007']);
  });
  it('--owner none returns unassigned; --owner everyone returns group', () => {
    expect(q({ owner: 'none' })).toEqual(['000004']);
    expect(q({ owner: 'everyone' })).toEqual(['000005']);
  });
  it('--owner with an unknown name gives a notice and no items', () => {
    const r = queryWithNotices(items, { owner: 'Zed Nobody' }, dir, ASOF);
    expect(r.items).toEqual([]);
    expect(r.notices[0]).toMatch(/no such person/);
  });
  it('filters are AND-ed', () => {
    expect(q({ owner: 'Priya Nair', status: 'overdue' }).sort()).toEqual(['000001', '000007']);
    expect(q({ owner: 'Priya Nair', dueBefore: '2026-10-05' })).toEqual(['000001']);
  });
});

describe('order and purity', () => {
  it('overdue first, then due asc, null last', () => {
    expect(q({})).toEqual(['000004', '000001', '000007', '000005', '000002', '000003']);
  });
  it('same query twice gives the same order; input is untouched', () => {
    const snap = JSON.stringify(items);
    expect(q({})).toEqual(q({}));
    expect(JSON.stringify(items)).toBe(snap);
    const shuffled = [...items].reverse();
    expect(ids(queryItems(shuffled, {}, dir, ASOF))).toEqual(q({}));
  });
  it('ties on date break by owner name then id', () => {
    const a = item({ id: 'bbbbbb', owner: owner('karan-joshi'), due: due('2026-10-20') });
    const b = item({ id: 'aaaaaa', owner: owner('karan-joshi'), due: due('2026-10-20') });
    const c = item({ id: 'cccccc', owner: owner('anita-desai'), due: due('2026-10-20') });
    expect(ids(queryItems([a, b, c], {}, directoryOf({ meetings: [] }), ASOF))).toEqual([
      'cccccc',
      'aaaaaa',
      'bbbbbb',
    ]);
  });
});

describe('parseFilters', () => {
  const clock = fixedClock;
  it('defaults as-of to the injected clock', () => {
    expect(parseFilters({}, clock).asOf).toBe('2026-11-24');
  });
  it('accepts valid values, trims, case-insensitive status', () => {
    const r = parseFilters(
      { status: ' Overdue ', dueBefore: '2026-10-01', asOf: '2026-10-15', owner: ' Sam ' },
      clock,
    );
    expect(r).toEqual({
      filters: { status: 'overdue', dueBefore: '2026-10-01', owner: 'Sam' },
      asOf: '2026-10-15',
    });
  });
  it.each([
    [{ status: 'nonsense' }, /--status must be one of open, done, overdue/],
    [{ dueBefore: '10/01/2026' }, /--due-before/],
    [{ dueBefore: '2026-02-31' }, /--due-before/],
    [{ asOf: 'tomorrow' }, /--as-of/],
    [{ owner: '  ' }, /--owner/],
  ])('rejects %j', (args, msg) => {
    expect(() => parseFilters(args, clock)).toThrow(UsageError);
    expect(() => parseFilters(args, clock)).toThrow(msg);
  });
});

describe('against the ingested sample (--as-of 2026-10-15)', () => {
  it('acceptance 7-9 on real data', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'at-q-'));
    const file = join(tmp, 's.json');
    await ingest(NOTES_DIR, { store: file, clock: fixedClock });
    const store = loadStore(file);
    const all = itemsOf(store);
    const d = directoryOf(store);
    const run = (f: Parameters<typeof queryItems>[1]) => queryItems(all, f, d, ASOF);

    const overdue = run({ status: 'overdue' });
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.every((i) => i.due.date !== null && i.status !== 'done')).toBe(true);

    const before = run({ dueBefore: '2026-10-01', status: 'done' });
    expect(before.every((i) => i.due.date !== null && (i.due.date as string) < '2026-10-01')).toBe(
      true,
    );

    const shah = run({ owner: 'Priya Shah' });
    expect(shah.length).toBeGreaterThan(0);
    expect(
      shah.every(
        (i) => i.owner.people.includes('priya-shah') || i.owner.candidates.includes('priya-shah'),
      ),
    ).toBe(true);
    expect(() => run({ owner: 'Priya' })).toThrow(/Priya Nair.*Priya Shah|Priya Shah.*Priya Nair/);

    expect(
      run({ owner: 'none' })
        .map((i) => i.task)
        .sort(),
    ).toEqual(['update the CRM notes', 'write the design-system changelog']);
    expect(run({}).some((i) => i.occurrences[0]?.sourceFile === 'untitled.md')).toBe(true);
    expect(run({}).map((i) => i.id)).toEqual(run({}).map((i) => i.id));
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('no I/O and no direct clock in queryItems', () => {
  it('query modules do not import fs or call Date.now', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['list.ts', 'status.ts']) {
      const t = readFileSync(join(__dirname, '../../../src/core/query', f), 'utf8');
      expect(t).not.toMatch(/node:fs|Date\.now\(|new Date\(\s*\)/);
    }
  });
});
