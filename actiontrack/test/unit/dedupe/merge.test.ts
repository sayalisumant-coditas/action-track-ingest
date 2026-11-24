import { describe, expect, it } from 'vitest';
import { mergeOccurrences, type ParsedItem } from '../../../src/core/dedupe/merge.js';
import { DEFAULT_MERGE_THRESHOLD } from '../../../src/core/dedupe/similarity.js';
import { ConfigError } from '../../../src/core/errors.js';
import { makeId } from '../../../src/core/store/ids.js';
import type { DueRef, OwnerRef } from '../../../src/core/types.js';
import { WarningCode } from '../../../src/core/warnings.js';

// ---- builders ---------------------------------------------------------------------------

const person = (...people: string[]): OwnerRef => ({
  kind: 'person',
  raw: people.join(' & '),
  people,
  helpers: [],
  candidates: [],
});
const ambiguous = (raw: string): OwnerRef => ({
  kind: 'ambiguous',
  raw,
  people: [],
  helpers: [],
  candidates: [],
});
const group: OwnerRef = { kind: 'group', raw: 'Everyone', people: [], helpers: [], candidates: [] };
const unassigned: OwnerRef = {
  kind: 'unassigned',
  raw: 'Someone',
  people: [],
  helpers: [],
  candidates: [],
};

interface Opts {
  checked?: boolean;
  due?: string | null;
  dueRaw?: string | null;
  line?: number;
  file?: string;
  parentLine?: number;
}

/** `md` is a date `YYYY-MM-DD`; the file defaults to `<date>-notes.md`; `null` means undated. */
function p(owner: OwnerRef, task: string, md: string | null, o: Opts = {}): ParsedItem {
  const file = o.file ?? (md ? `${md}-notes.md` : 'untitled.md');
  const date = o.due ?? null;
  const due: DueRef = {
    raw: o.dueRaw === undefined ? date : o.dueRaw,
    date,
    inferred: false,
  };
  const item: ParsedItem = {
    meeting: { id: file.replace(/\.md$/, ''), sourceFile: file, date: md },
    owner,
    task,
    line: o.line ?? 5,
    rawLine: `- [${o.checked ? 'x' : ' '}] ${task}`,
    checked: o.checked ?? false,
    due,
  };
  if (o.parentLine !== undefined) item.parentLine = o.parentLine;
  return item;
}

const priya = person('priya-nair');
const rahulM = person('rahul-mehta');
const rahulV = person('rahul-verma');
const anita = person('anita-desai');
const karan = person('karan-joshi');
const sam = person('sam-okafor');
const meera = person('meera-iyer');
const lena = person('lena-fischer');

// ---- E. golden merges -------------------------------------------------------------------

describe('E. mergeOccurrences golden cases [DUP]', () => {
  it('M7-50 quote to Acme: 3 occurrences, done', () => {
    const r = mergeOccurrences([
      p(priya, 'send the revised quote to Acme', '2026-09-01', { due: '2026-09-04' }),
      p(priya, 'send revised quote to Acme', '2026-09-08', { due: '2026-09-04' }),
      p(priya, 'send the revised quote to Acme', '2026-09-15', {
        checked: true,
        due: '2026-09-11',
      }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ status: 'done', doneBy: 'notes' });
    expect(r.items[0]?.occurrences).toHaveLength(3);
  });

  it('M7-51 cloud budget', () => {
    const r = mergeOccurrences(
      ['2026-09-01', '2026-09-15', '2026-09-22'].map((d, i) =>
        p(sam, 'confirm cloud budget with finance', d, { checked: i === 2 }),
      ),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.status).toBe('done');
    expect(r.items[0]?.occurrences).toHaveLength(3);
  });

  it('M7-52/53 wireframes: the later two merge, the 09-01 line is reported as uncertain', () => {
    const r = mergeOccurrences([
      p(anita, 'share first wireframes', '2026-09-01', { due: '2026-09-03' }),
      p(anita, 'share updated wireframes', '2026-09-15', { due: '2026-09-17' }),
      p(anita, 'share updated wireframes', '2026-09-22', { due: '2026-09-24' }),
    ]);
    expect(r.items).toHaveLength(2);
    const slip = r.items[1];
    expect(slip?.due.date).toBe('2026-09-24');
    expect(slip?.dueHistory).toEqual(['2026-09-17']);
    expect(slip?.occurrences).toHaveLength(2);
    // 0.667 is in the 0.6-0.85 band: kept apart and listed
    expect(r.uncertain).toHaveLength(1);
    expect(r.uncertain[0]).toMatchObject({ a: r.items[0]?.id, b: slip?.id });
    expect(r.uncertain[0]?.score).toBeGreaterThanOrEqual(0.6);
    expect(r.uncertain[0]?.score).toBeLessThan(0.85);
  });

  it('M7-54/55/57 a checked later occurrence makes the item done', () => {
    for (const [o, t] of [
      [rahulM, 'set up staging'],
      [karan, 'export last quarter invoices'],
      [karan, 'approve Q4 cloud spend'],
    ] as const) {
      const r = mergeOccurrences([p(o, t, '2026-09-01'), p(o, t, '2026-09-17', { checked: true })]);
      expect(r.items).toHaveLength(1);
      expect(r.items[0]?.status).toBe('done');
    }
  });

  it('M7-56 freeze invoice edits: 2 occurrences, still open', () => {
    const r = mergeOccurrences([
      p(karan, 'freeze invoice edits from 9 Oct', '2026-09-29'),
      p(karan, 'freeze invoice edits from 9 Oct', '2026-10-08'),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.status).toBe('open');
    expect(r.items[0]?.occurrences).toHaveLength(2);
  });

  it('M7-58 book renewal call: 3 occurrences, done', () => {
    const t = "book the renewal call with Acme's CTO";
    const r = mergeOccurrences([
      p(meera, t, '2026-09-10'),
      p(meera, t, '2026-09-28'),
      p(meera, t, '2026-10-14', { checked: true }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.status).toBe('done');
    expect(r.items[0]?.occurrences).toHaveLength(3);
  });

  it('M7-59 one-pager: open, 2 occurrences; a later line with no due keeps the old date (M7-97)', () => {
    const r = mergeOccurrences([
      p(priya, 'prepare the renewal one-pager', '2026-09-28', {
        due: '2026-10-02',
        dueRaw: 'Friday',
      }),
      p(priya, 'prepare the renewal one-pager', '2026-10-14'),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.status).toBe('open');
    expect(r.items[0]?.occurrences).toHaveLength(2);
    // The plan says dueHistory holds 2026-10-02; M7-97 says a missing date never erases a known one.
    // The 10-14 line has no due, so both cannot hold. M7-97 wins and the date stays current.
    expect(r.items[0]?.due.date).toBe('2026-10-02');
    expect(r.items[0]?.dueHistory).toEqual([]);
  });

  it('M7-59b a new later due pushes 2026-10-02 into the history', () => {
    const r = mergeOccurrences([
      p(priya, 'prepare the renewal one-pager', '2026-09-28', { due: '2026-10-02' }),
      p(priya, 'prepare the renewal one-pager', '2026-10-14', { due: '2026-10-21' }),
    ]);
    expect(r.items[0]?.dueHistory).toEqual(['2026-10-02']);
  });

  it('M7-60 review schema mapping doc stays open', () => {
    const r = mergeOccurrences([
      p(rahulV, 'review the schema mapping doc', '2026-09-03'),
      p(rahulV, 'review the schema mapping doc', '2026-09-17'),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.status).toBe('open');
  });

  it('M7-61 finalise welcome-email copy', () => {
    const r = mergeOccurrences([
      p(anita, 'finalise the welcome-email copy', '2026-09-14'),
      p(anita, 'finalize welcome-email copy', '2026-09-24'),
      p(anita, 'finalise the welcome-email copy', '2026-10-05', { checked: true }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.status).toBe('done');
  });

  it('M7-62/63 occurrences in date order; task from the first occurrence', () => {
    const r = mergeOccurrences([
      p(priya, 'send quote to Acme', '2026-09-15', { checked: true, due: '2026-09-18' }),
      p(priya, 'send the quote to Acme', '2026-09-01', { due: '2026-09-04' }),
    ]);
    const item = r.items[0];
    expect(item?.task).toBe('send the quote to Acme');
    expect(item?.occurrences.map((o) => o.meetingId)).toEqual([
      '2026-09-01-notes',
      '2026-09-15-notes',
    ]);
    expect(item?.occurrences.map((o) => [o.checked, o.due.date])).toEqual([
      [false, '2026-09-04'],
      [true, '2026-09-18'],
    ]);
  });
});

// ---- F. separate items ------------------------------------------------------------------

describe('F. items that stay separate [DUP]', () => {
  it('M7-70 estimate vs start', () =>
    expect(
      mergeOccurrences([
        p(rahulV, 'estimate the SSO work', '2026-09-14'),
        p(rahulV, 'estimate SSO work', '2026-09-24'),
        p(rahulV, 'start SSO spike', '2026-10-05'),
      ]).items,
    ).toHaveLength(2));

  it('M7-71 collect vs publish', () =>
    expect(
      mergeOccurrences([
        p(lena, 'collect 5 customer quotes', '2026-09-14'),
        p(lena, 'publish the customer quotes', '2026-10-05'),
      ]).items,
    ).toHaveLength(2));

  it('M7-72 book vs schedule, different owners', () =>
    expect(
      mergeOccurrences([
        p(meera, 'book renewal call', '2026-09-10'),
        p(lena, 'schedule QBR', '2026-10-14'),
      ]).items,
    ).toHaveLength(2));

  it('M7-73 same task, different owners', () =>
    expect(
      mergeOccurrences([
        p(sam, 'confirm rollback plan', '2026-10-08'),
        p(karan, 'confirm rollback plan', '2026-10-08'),
      ]).items,
    ).toHaveLength(2));

  it('M7-74 joint vs single owner', () =>
    expect(
      mergeOccurrences([
        p(person('anita-desai', 'rahul-mehta'), 'agree on the API', '2026-09-18'),
        p(anita, 'agree on the API', '2026-09-25'),
      ]).items,
    ).toHaveLength(2));

  it('M7-75 Priya Nair vs Priya Shah [NAME]', () =>
    expect(
      mergeOccurrences([
        p(person('priya-nair'), 'sign off', '2026-09-17'),
        p(person('priya-shah'), 'sign off', '2026-09-24'),
      ]).items,
    ).toHaveLength(2));

  it('M7-76 ambiguous Priya vs Priya Nair [NAME]', () =>
    expect(
      mergeOccurrences([
        p(ambiguous('Priya'), 'sign off', '2026-09-17'),
        p(priya, 'sign off', '2026-09-24'),
      ]).items,
    ).toHaveLength(2));

  it('M7-77 ?priya merges with ?priya only [NAME]', () => {
    const r = mergeOccurrences([
      p(ambiguous('Priya'), 'sign off the checklist', '2026-09-17'),
      p(priya, 'sign off the checklist', '2026-09-20'),
      p(ambiguous('Priya'), 'sign off the checklist', '2026-09-30'),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.occurrences.length).sort()).toEqual([1, 2]);
  });

  it('M7-78 ?priya vs ?rahul [NAME]', () =>
    expect(
      mergeOccurrences([
        p(ambiguous('Priya'), 'own the hiring plan', '2026-09-30'),
        p(ambiguous('Rahul'), 'own the hiring plan', '2026-09-30', { line: 6 }),
      ]).items,
    ).toHaveLength(2));

  it('M7-79 two unassigned items merge [GAP]', () =>
    expect(
      mergeOccurrences([
        p(unassigned, 'update the CRM notes', '2026-09-10'),
        p(unassigned, 'update the CRM notes', '2026-10-10'),
      ]).items,
    ).toHaveLength(1));

  it('M7-80 unassigned vs group [GAP]', () =>
    expect(
      mergeOccurrences([
        p(unassigned, 'review the prototype', '2026-09-10'),
        p(group, 'review the prototype', '2026-09-11'),
      ]).items,
    ).toHaveLength(2));

  it('M7-81 two group items merge', () =>
    expect(
      mergeOccurrences([
        p(group, 'review the prototype', '2026-09-10'),
        p(group, 'review the prototype', '2026-09-17'),
      ]).items,
    ).toHaveLength(1));

  it('M7-82 borderline pair: not merged, listed with its score', () => {
    const r = mergeOccurrences([
      p(anita, 'share updated wireframes', '2026-09-15'),
      p(anita, 'share wireframes', '2026-09-22'),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.uncertain).toEqual([{ a: r.items[0]?.id, b: r.items[1]?.id, score: 0.8 }]);
  });

  it('M7-83 below 0.6: a new item, not uncertain', () => {
    const r = mergeOccurrences([
      p(anita, 'share wireframes', '2026-09-15'),
      p(anita, 'audit colour contrast', '2026-09-22'),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.uncertain).toEqual([]);
  });
});

// ---- G. status and due rules ------------------------------------------------------------

describe('G. status and due rules', () => {
  const t = 'send the deck to Acme';

  it('M7-90 any checked occurrence', () => {
    const r = mergeOccurrences([p(priya, t, '2026-09-01', { checked: true })]);
    expect(r.items[0]).toMatchObject({ status: 'done', doneBy: 'notes' });
  });

  it('M7-91 reopened in the notes stays done, flagged and warned', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01', { checked: true }),
      p(priya, t, '2026-09-08'),
    ]);
    expect(r.items[0]?.status).toBe('done');
    expect(r.items[0]?.flags).toEqual(['reopened-in-notes']);
    expect(r.warnings.map((w) => w.code)).toEqual([WarningCode.ITEM_REOPENED]);
    expect(r.warnings[0]).toMatchObject({ file: '2026-09-08-notes.md', line: 5 });
  });

  it('M7-92 all unchecked is open', () => {
    const r = mergeOccurrences(
      ['2026-09-01', '2026-09-08', '2026-09-15'].map((d) => p(priya, t, d)),
    );
    expect(r.items[0]?.status).toBe('open');
    expect(r.items[0]?.doneBy).toBeUndefined();
  });

  it('M7-93 unchecked, checked, checked: done and no warning', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01'),
      p(priya, t, '2026-09-08', { checked: true }),
      p(priya, t, '2026-09-15', { checked: true }),
    ]);
    expect(r.items[0]?.status).toBe('done');
    expect(r.warnings).toEqual([]);
    expect(r.items[0]?.flags).toEqual([]);
  });

  it('M7-94/95 the latest due wins; old dues go to history in order', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01', { due: '2026-09-04' }),
      p(priya, t, '2026-09-08', { due: '2026-09-11' }),
      p(priya, t, '2026-09-15', { due: '2026-09-18' }),
    ]);
    expect(r.items[0]?.due.date).toBe('2026-09-18');
    expect(r.items[0]?.dueHistory).toEqual(['2026-09-04', '2026-09-11']);
  });

  it('M7-96 an equal due leaves the history alone', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01', { due: '2026-09-04' }),
      p(priya, t, '2026-09-08', { due: '2026-09-04' }),
    ]);
    expect(r.items[0]?.dueHistory).toEqual([]);
  });

  it('M7-97 a missing later due keeps the earlier date [GAP]', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01', { due: '2026-09-04' }),
      p(priya, t, '2026-09-08'),
    ]);
    expect(r.items[0]?.due.date).toBe('2026-09-04');
    expect(r.items[0]?.dueHistory).toEqual([]);
  });

  it('M7-98 first without a due, later with one [GAP]', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01'),
      p(priya, t, '2026-09-08', { due: '2026-09-11' }),
    ]);
    expect(r.items[0]?.due.date).toBe('2026-09-11');
    expect(r.items[0]?.dueHistory).toEqual([]);
  });

  it('M7-99 an unresolved later due keeps the earlier date; the raw text stays on the occurrence', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01', { due: '2026-09-04' }),
      p(priya, t, '2026-09-08', { due: null, dueRaw: 'after the cutover' }),
    ]);
    expect(r.items[0]?.due.date).toBe('2026-09-04');
    expect(r.items[0]?.occurrences[1]?.due.raw).toBe('after the cutover');
  });

  it('M7-100 same meeting date: ordering by file name keeps the result stable', () => {
    const a = p(priya, t, '2026-09-01', { file: 'a.md', checked: true });
    const b = p(priya, t, '2026-09-01', { file: 'b.md' });
    expect(mergeOccurrences([b, a])).toEqual(mergeOccurrences([a, b]));
    expect(mergeOccurrences([b, a]).items[0]?.occurrences.map((o) => o.sourceFile)).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('M7-101 the same task twice in one file merges with a warning [DUP]', () => {
    const r = mergeOccurrences([
      p(priya, t, '2026-09-01', { line: 5 }),
      p(priya, t, '2026-09-01', { line: 9 }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.occurrences).toHaveLength(2);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({
      code: WarningCode.DUPLICATE_IN_FILE,
      file: '2026-09-01-notes.md',
      line: 9,
    });
  });
});

// ---- H. ordering, undated meetings, parents --------------------------------------------

describe('H. ordering, undated meetings, parents', () => {
  const set = () => [
    p(priya, 'send the deck to Acme', '2026-09-15', { checked: true }),
    p(priya, 'send the deck to Acme', '2026-09-01', { due: '2026-09-04' }),
    p(sam, 'confirm rollback plan', '2026-09-08'),
    p(anita, 'share wireframes', null, { line: 2 }),
    p(sam, 'confirm rollback plan', '2026-09-22', { due: '2026-09-25' }),
  ];

  it('M7-110 shuffled input gives identical output (property)', () => {
    const base = mergeOccurrences(set());
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 25; i++) {
      const shuffled = set()
        .map((x) => ({ x, k: rnd() }))
        .sort((a, b) => a.k - b.k)
        .map((o) => o.x);
      expect(mergeOccurrences(shuffled)).toEqual(base);
    }
  });

  it('M7-111 sort key is (date, file, line)', () => {
    const r = mergeOccurrences([
      p(sam, 'task alpha', '2026-09-02', { file: 'b.md', line: 1 }),
      p(lena, 'task beta', '2026-09-02', { file: 'a.md', line: 9 }),
      p(karan, 'task gamma', '2026-09-02', { file: 'a.md', line: 2 }),
      p(meera, 'task delta', '2026-09-01', { file: 'z.md', line: 1 }),
    ]);
    expect(r.items.map((i) => i.task)).toEqual([
      'task delta',
      'task gamma',
      'task beta',
      'task alpha',
    ]);
  });

  it('M7-112 undated items come after dated ones [GAP]', () => {
    const r = mergeOccurrences([
      p(sam, 'chase the vendor', null),
      p(lena, 'zzz late task', '2026-12-31'),
    ]);
    expect(r.items.map((i) => i.task)).toEqual(['zzz late task', 'chase the vendor']);
  });

  it('M7-113 undated, same owner, different wording: not merged [GAP]', () => {
    const r = mergeOccurrences([
      p(priya, 'send the revised quote to Acme', '2026-09-01'),
      p(priya, 'send quote to Acme', null),
    ]);
    expect(r.items).toHaveLength(2);
  });

  it('M7-114 undated, identical owner and text: merged [GAP]', () => {
    const r = mergeOccurrences([
      p(priya, 'send the revised quote to Acme', '2026-09-01'),
      p(priya, 'send the revised quote to Acme', null),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.occurrences).toHaveLength(2);
  });

  it('M7-115 a nested item gets parentId', () => {
    const r = mergeOccurrences([
      p(meera, 'finalise Q4 targets', '2026-09-30', { line: 12 }),
      p(karan, 'validate targets against the budget', '2026-09-30', { line: 13, parentLine: 12 }),
    ]);
    expect(r.items[1]?.parentId).toBe(r.items[0]?.id);
    expect(r.items[0]?.parentId).toBeUndefined();
  });

  it('M7-116 parent dropped: no parentId, no throw', () => {
    const r = mergeOccurrences([
      p(karan, 'validate targets', '2026-09-30', { line: 13, parentLine: 12 }),
    ]);
    expect(r.items[0]?.parentId).toBeUndefined();
  });

  it("M7-117 parent merged into an older item: the child follows that item's id", () => {
    const r = mergeOccurrences([
      p(meera, 'finalise Q4 targets', '2026-09-10', { line: 3 }),
      p(meera, 'finalise Q4 targets', '2026-09-30', { line: 12 }),
      p(karan, 'validate targets', '2026-09-30', { line: 13, parentLine: 12 }),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]?.parentId).toBe(r.items[0]?.id);
  });

  it('M7-118 child merged across meetings: one child item, parent link kept', () => {
    const r = mergeOccurrences([
      p(meera, 'finalise Q4 targets', '2026-09-10', { line: 3 }),
      p(karan, 'validate targets', '2026-09-10', { line: 4, parentLine: 3 }),
      p(karan, 'validate targets', '2026-09-30', { line: 8 }),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]?.occurrences).toHaveLength(2);
    expect(r.items[1]?.parentId).toBe(r.items[0]?.id);
  });

  it('M7-128 a merged item id comes from its first occurrence', () => {
    const first = p(priya, 'send quote', '2026-09-01');
    const later = p(priya, 'send quote', '2026-09-08');
    const r = mergeOccurrences([later, first]);
    expect(r.items[0]?.id).toBe(
      makeId({ sourceFile: first.meeting.sourceFile, rawLine: first.rawLine }),
    );
  });
});

// ---- J. configuration -------------------------------------------------------------------

describe('J. threshold', () => {
  const pair = (a: string, b: string) => [p(anita, a, '2026-09-15'), p(anita, b, '2026-09-22')];

  it('M7-130 default is 0.85', () => expect(DEFAULT_MERGE_THRESHOLD).toBe(0.85));

  it('M7-131 at 0.7 the borderline pair merges and golden cases still hold', () => {
    const items = pair('share updated wireframes', 'share wireframes');
    expect(mergeOccurrences(items).items).toHaveLength(2);
    const r = mergeOccurrences(items, { threshold: 0.7 });
    expect(r.items).toHaveLength(1);
    expect(r.uncertain).toEqual([]);
    expect(
      mergeOccurrences(
        [p(priya, 'send quote', '2026-09-01'), p(priya, 'send quote', '2026-09-08')],
        { threshold: 0.7 },
      ).items,
    ).toHaveLength(1);
    expect(
      mergeOccurrences(
        [p(rahulV, 'estimate SSO work', '2026-09-01'), p(rahulV, 'start SSO spike', '2026-09-08')],
        { threshold: 0.7 },
      ).items,
    ).toHaveLength(2);
  });

  it('M7-132 at 0.95 the "the"-less variant splits and is reported', () => {
    const items = pair('send the revised quote to Acme', 'send quote to Acme');
    expect(mergeOccurrences(items).items).toHaveLength(1);
    const r = mergeOccurrences(items, { threshold: 0.95 });
    expect(r.items).toHaveLength(2);
    expect(r.uncertain).toHaveLength(1);
  });

  it.each([1.5, -1, 'x', NaN, null])('M7-133 invalid threshold %s [BAD]', (t) =>
    expect(() => mergeOccurrences([], { threshold: t as number })).toThrow(ConfigError),
  );

  it('M7-149 empty input [BAD]', () =>
    expect(mergeOccurrences([])).toEqual({ items: [], uncertain: [], warnings: [] }));
});
