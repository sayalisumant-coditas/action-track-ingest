import { describe, expect, it } from 'vitest';
import {
  AmbiguousOwnerError,
  ConfigError,
  DrafterError,
  FolderError,
  StoreError,
  UnknownIdError,
  UsageError,
} from '../../../src/core/errors.js';
import { describeError, handleError } from '../../../src/cli/errors.js';
import {
  colour,
  jsonRow,
  plain,
  renderDraft,
  renderReport,
  renderTable,
  useColour,
} from '../../../src/cli/format.js';
import { buildProgram } from '../../../src/cli/program.js';
import type { IO } from '../../../src/cli/io.js';
import {
  due,
  fixedClock,
  groupOwner,
  item,
  owner,
  unassignedOwner,
  ambiguousOwner,
  emptyReport,
} from '../../helpers/factory.js';
import { sampleDirectory } from '../../helpers/people.js';

const dir = sampleDirectory();
const ASOF = '2026-10-15';

const items = [
  item({ id: 'aaaaaa', task: 'overdue task', owner: owner('priya-nair'), due: due('2026-10-01') }),
  item({ id: 'bbbbbb', task: 'no owner no date', owner: unassignedOwner(), due: due(null, null) }),
  item({ id: 'cccccc', task: 'ambiguous', owner: ambiguousOwner('priya-nair', 'priya-shah') }),
  item({ id: 'dddddd', task: 'group', owner: groupOwner() }),
  item({ id: 'eeeeee', task: 'joint', owner: owner('priya-nair', 'karan-joshi') }),
];

function fakeIO(over: Partial<IO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: IO = {
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    isTTY: false,
    columns: Number.POSITIVE_INFINITY,
    env: {},
    cwd: process.cwd(),
    clock: fixedClock,
    ...over,
  };
  return { io, out, err };
}

describe('A. buildProgram', () => {
  it('M12-01/08 registers exactly the four commands and no send', () => {
    const p = buildProgram(fakeIO().io);
    expect(p.commands.map((c) => c.name()).sort()).toEqual(['done', 'followup', 'ingest', 'list']);
    expect(p.helpInformation()).not.toMatch(/send/i);
    expect(p.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(['--store', '--config', '--no-color']),
    );
  });
  it('M12-03 each command lists its options', () => {
    const p = buildProgram(fakeIO().io);
    const longs = (n: string) => p.commands.find((c) => c.name() === n)?.options.map((o) => o.long);
    expect(longs('ingest')).toEqual(['--recursive', '--verbose', '--json']);
    expect(longs('list')).toEqual(['--owner', '--status', '--due-before', '--as-of', '--json']);
    expect(longs('followup')).toEqual(
      expect.arrayContaining(['--dry-run', '--include-group', '--replace', '--gmail', '--as-of']),
    );
  });
});

describe('G. renderTable / colour', () => {
  it('M12-104 columns and row texts for a fixed set', () => {
    const t = renderTable(items, dir, ASOF, { style: plain });
    const lines = t.split('\n');
    expect(lines[0]).toMatch(/^ID\s+OWNER\s+TASK\s+DUE\s+STATUS\s+SOURCE$/);
    expect(lines).toHaveLength(6);
    expect(t).toContain('Priya Nair');
    expect(t).toContain('unassigned');
    expect(t).toContain('no due date');
    expect(t).toContain('Priya (Nair or Shah?)');
    expect(t).toContain('Everyone');
    expect(t).toContain('Priya Nair & Karan Joshi'); // M12-49
    expect(lines[1]).toMatch(/^aaaaaa\s.*2026-10-01\s+overdue\s/);
  });
  it('M12-101 coloured: overdue rows red; unassigned and no due date dim', () => {
    const t = renderTable(items, dir, ASOF, { style: colour });
    const [, overdueRow, noOwnerRow] = t.split('\n');
    expect(overdueRow).toContain('\u001b[31m');
    expect(noOwnerRow).toContain('\u001b[2munassigned');
    expect(noOwnerRow).toContain('\u001b[2mno due date');
  });
  it('M12-100/102/103 useColour rules', () => {
    expect(useColour({ isTTY: false })).toBe(false);
    expect(useColour({ isTTY: true })).toBe(true);
    expect(useColour({ isTTY: true, noColor: true })).toBe(false);
    expect(useColour({ isTTY: true, env: { NO_COLOR: '1' } })).toBe(false);
    expect(useColour({ isTTY: true, env: { NO_COLOR: '' } })).toBe(true);
  });
  it('plain style adds no escape codes', () => {
    expect(renderTable(items, dir, ASOF, { style: plain })).not.toContain('\u001b');
  });
  it('M12-48/106 a narrow terminal truncates the task, never the id', () => {
    const long = item({ id: 'ffffff', task: 'x'.repeat(200) });
    const t = renderTable([long], dir, ASOF, { columns: 40, style: plain });
    const row = t.split('\n')[1] as string;
    expect(row.startsWith('ffffff')).toBe(true);
    expect(row).toContain('~');
    expect(row).not.toContain('x'.repeat(100));
    expect(t.split('\n')).toHaveLength(2); // no wrapping into extra rows
  });
});

describe('D. jsonRow', () => {
  it('M12-62/66 stable key set', () => {
    expect(Object.keys(jsonRow(items[0]!, dir, ASOF))).toEqual([
      'id',
      'owner',
      'ownerKind',
      'ownerAmbiguity',
      'ownerCandidates',
      'task',
      'due',
      'dueRaw',
      'status',
      'source',
      'occurrences',
      'flags',
    ]);
  });
  it('M12-63/64 missing owner/due and ambiguous owner', () => {
    const un = jsonRow(items[1]!, dir, ASOF);
    expect(un).toMatchObject({ owner: 'unassigned', due: null, dueRaw: null });
    const amb = jsonRow(items[2]!, dir, ASOF);
    expect(amb).toMatchObject({
      ownerAmbiguity: 'ambiguous',
      ownerCandidates: ['Priya Nair', 'Priya Shah'],
    });
  });
  it('M12-67 JSON has no ANSI codes', () => {
    expect(JSON.stringify(items.map((i) => jsonRow(i, dir, ASOF)))).not.toContain('\u001b');
  });
});

describe('G. renderReport', () => {
  const report = {
    ...emptyReport(),
    filesScanned: 4,
    filesRead: 2,
    meetings: 2,
    items: 3,
    skipped: [
      { file: 'a.md', reason: 'empty' as const },
      { file: 'b.md', reason: 'binary' as const },
    ],
    warningCounts: { DATE_INFERRED: 1, OWNER_AMBIGUOUS: 2 },
    counts: { unassigned: 1, noDueDate: 2, ambiguousOwner: 2 },
    warnings: [{ file: 'a.md', line: 3, code: 'DATE_INFERRED', message: 'guessed' }],
    ignoredCandidates: [{ file: 'a.md', line: 9, why: 'code' as const }],
    uncertainMerges: [{ a: 'x1', b: 'y2', score: 0.7 }],
  };
  it('M12-105 summary: counts, skipped reasons, warnings by code', () => {
    expect(renderReport(report)).toBe(
      [
        'Scanned 4 files: 2 read, 2 skipped',
        'Meetings: 2   Items: 3',
        '',
        'Skipped:',
        '  a.md: empty',
        '  b.md: binary',
        '',
        'Warnings:',
        '  DATE_INFERRED x1',
        '  OWNER_AMBIGUOUS x2',
        '',
        'To review: 1 with no owner, 2 with an unclear owner, 2 with no due date',
        '',
        'Possible duplicates kept apart (1):',
        '  x1 ~ y2 (similarity 0.7)',
      ].join('\n'),
    );
  });
  it('M12-15/16 detail only with verbose', () => {
    expect(renderReport(report)).not.toContain('a.md:3');
    const v = renderReport(report, true);
    expect(v).toContain('a.md:3 DATE_INFERRED guessed');
    expect(v).toContain('a.md:9 (code)');
  });
  it('M12-20 zero files', () => {
    expect(renderReport({ ...emptyReport(), filesScanned: 0 })).toMatch(
      /^Scanned 0 files: 0 read, 0 skipped/,
    );
  });
});

describe('F. renderDraft', () => {
  it('M12-94 shows To, Subject, item ids, warnings and body', () => {
    const t = renderDraft({
      to: '',
      subject: 'Follow-up: 1 open action item (0 overdue)',
      body: 'Hi Sam,\n\n- thing',
      itemIds: ['aaaaaa', 'bbbbbb'],
      warnings: [{ code: 'MISSING_EMAIL', message: 'no email' }],
    });
    expect(t).toContain('To:      (empty)');
    expect(t).toContain('Subject: Follow-up: 1 open action item (0 overdue)');
    expect(t).toContain('Items:   aaaaaa, bbbbbb');
    expect(t).toContain('MISSING_EMAIL: no email');
    expect(t.endsWith('Hi Sam,\n\n- thing')).toBe(true);
  });
});

describe('H. handleError', () => {
  const run = (e: unknown, verbose = false) => {
    const lines: string[] = [];
    const code = handleError(e, (t) => lines.push(t), verbose);
    return { code, text: lines.join('\n') };
  };
  it('M12-110..114 each expected error gives a message, a hint and exit 1', () => {
    const cases: [unknown, RegExp][] = [
      [new FolderError('/x/y'), /\/x\/y.*Check the folder path/s],
      [new StoreError('bad json'), /bad json.*not changed.*--store/s],
      [new AmbiguousOwnerError(['Priya Nair', 'Priya Shah']), /Priya Nair, Priya Shah/],
      [new UnknownIdError('zz'), /unknown id: zz.*actiontrack list/s],
      [new UsageError('--status is bad'), /--status is bad.*--help/s],
      [new ConfigError('cfg.json', 'bad'), /cfg\.json.*--config/s],
      [new DrafterError('nope'), /nope.*No draft was created/s],
    ];
    for (const [e, re] of cases) {
      const r = run(e);
      expect(r.code).toBe(1);
      expect(r.text).toMatch(/^error: /);
      expect(r.text).toMatch(re);
    }
  });
  it('M12-115 unexpected error: short message and --verbose hint', () => {
    const r = run(new TypeError('boom'));
    expect(r.code).toBe(1);
    expect(r.text).toContain('unexpected problem: boom');
    expect(r.text).toContain('--verbose');
    expect(r.text).not.toContain('at ');
  });
  it('M12-116 --verbose prints the stack', () => {
    const r = run(new TypeError('boom'), true);
    expect(r.text).toMatch(/TypeError: boom\n\s+at /);
  });
  it('M12-118 every expected error message includes an action hint (describeError is non-null)', () => {
    for (const e of [
      new FolderError('f'),
      new StoreError('s'),
      new UnknownIdError('i'),
      new UsageError('u'),
    ]) {
      expect(describeError(e)).toMatch(/Check|fix|Run|Give|pick/i);
    }
    expect(describeError(new Error('plain'))).toBeNull();
  });
});
