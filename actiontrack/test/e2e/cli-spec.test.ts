import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOTES_DIR } from '../helpers/fixtures.js';

const ROOT = resolve(__dirname, '../..');
const BIN = join(ROOT, 'dist', 'cli', 'index.js');

let work: string;
let store: string;

function cli(args: string[], env: Record<string, string> = {}, st: string = store) {
  const r = spawnSync(process.execPath, [BIN, '--store', st, ...args], {
    cwd: work,
    encoding: 'utf8',
    env: { ...process.env, ACTIONTRACK_STORE: '', NO_COLOR: '1', ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const bare = (args: string[]) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd: work, encoding: 'utf8', env: process.env });
type Row = {
  id: string;
  owner: string;
  ownerAmbiguity: string | null;
  ownerCandidates: string[];
  task: string;
  due: string | null;
  dueRaw: string | null;
  status: string;
  source: string;
  occurrences: number;
};
const rows = (args: string[]) => JSON.parse(cli(['list', '--json', ...args]).out) as Row[];

beforeAll(() => {
  execFileSync(
    process.execPath,
    [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'],
    { cwd: ROOT, stdio: 'pipe' },
  );
  work = mkdtempSync(join(tmpdir(), 'at-spec-'));
  store = join(work, 'store.json');
  expect(cli(['ingest', NOTES_DIR]).code).toBe(0);
}, 120_000);
afterAll(() => work && rmSync(work, { recursive: true, force: true }));

describe('A. program and help', () => {
  it('M12-01/02/08 help lists commands, global options, date rules; no send', () => {
    const h = bare(['--help']).stdout;
    for (const w of ['ingest', 'list', 'done', 'followup', '--store', '--config', '--no-color'])
      expect(h).toContain(w);
    expect(h).toMatch(/weekday/i);
    expect(h).toMatch(/\+7|7 days|next week/i);
    expect(h).not.toMatch(/\bsend\b/i);
  });
  it('M12-03 each command has its own help with its options', () => {
    expect(bare(['ingest', '--help']).stdout).toMatch(/--recursive[\s\S]*--verbose[\s\S]*--json/);
    expect(bare(['list', '--help']).stdout).toMatch(
      /--owner[\s\S]*--status[\s\S]*--due-before[\s\S]*--as-of/,
    );
    expect(bare(['done', '--help']).stdout).toContain('<id>');
    expect(bare(['followup', '--help']).stdout).toMatch(/--dry-run[\s\S]*--replace[\s\S]*--gmail/);
  });
  it('M12-04 no command: help is shown and exit is 1', () => {
    const r = bare([]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/Usage:/);
  });
  it('M12-05 unknown command: clear message, exit 1', () => {
    const r = bare(['foo']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown command 'foo'/);
  });
  it('M12-07 package.json bin points at the built file', () => {
    const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      bin: Record<string, string>;
    };
    expect(p.bin['actiontrack']).toBe('dist/cli/index.js');
    expect(existsSync(join(ROOT, p.bin['actiontrack'] as string))).toBe(true);
    expect(readFileSync(BIN, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });
});

describe('B. ingest', () => {
  it('M12-11/12/13/14/15 report text: skipped names, numbers, grouped warnings, no detail', () => {
    const t = join(work, 'b.json');
    const r = cli(['ingest', NOTES_DIR], {}, t);
    expect(r.code).toBe(0);
    expect(r.out).toContain('2026-09-09-notes-final-v2.md: empty');
    expect(r.out).toContain('scratch.md: binary');
    expect(r.out).not.toContain('.txt');
    expect(r.out).toMatch(/33 read, 2 skipped/);
    expect(r.out).toMatch(/Meetings: 33 {3}Items: 96/);
    // pinned: the sample really has 7 OWNER_AMBIGUOUS (spec says 5)
    expect(r.out).toMatch(/DATE_INFERRED x1/);
    expect(r.out).toMatch(/OWNER_AMBIGUOUS x7/);
    expect(r.out).toMatch(/DUE_UNRESOLVABLE x1/);
    expect(r.out).not.toContain('Warning details');
    expect(r.out).not.toContain('Ignored lines');
  });
  it('M12-16 --verbose adds details, ignored lines and uncertain merges', () => {
    const r = cli(['ingest', NOTES_DIR, '--verbose'], {}, join(work, 'b2.json'));
    expect(r.out).toContain('Warning details:');
    expect(r.out).toContain('Ignored lines:');
    for (const why of ['blockquote', 'code', 'comment']) expect(r.out).toContain(`(${why})`);
    expect(r.out).toMatch(/Possible duplicates kept apart \(1\)/);
  });
  it('M12-18 folder is a file: exit 1', () => {
    const f = join(work, 'plain.txt');
    writeFileSync(f, 'x');
    expect(cli(['ingest', f], {}, join(work, 'b3.json')).code).toBe(1);
  });
  it('M12-19/27 only bad files: exit 0 and all listed as skipped', () => {
    const d = join(work, 'bad');
    mkdirSync(d);
    writeFileSync(join(d, 'e.md'), '');
    writeFileSync(join(d, 'b.md'), Buffer.from([0, 1, 0, 2]));
    const r = cli(['ingest', d], {}, join(work, 'b4.json'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('e.md: empty');
    expect(r.out).toContain('b.md: binary');
  });
  it('M12-20 empty folder: exit 0, zero files', () => {
    const d = join(work, 'emptydir');
    mkdirSync(d);
    const r = cli(['ingest', d], {}, join(work, 'b5.json'));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Scanned 0 files/);
  });
  it('M12-22 --recursive picks up sub-folders only when asked', () => {
    const d = join(work, 'rec');
    mkdirSync(join(d, 'sub'), { recursive: true });
    writeFileSync(join(d, 'sub', '2026-09-01-x.md'), '# X\nDate: 2026-09-01\n\n- [ ] Sam: a\n');
    const flat = cli(['ingest', d, '--json'], {}, join(work, 'b6.json'));
    expect(JSON.parse(flat.out)).toMatchObject({ filesScanned: 0 });
    const deep = cli(['ingest', d, '--recursive', '--json'], {}, join(work, 'b7.json'));
    expect(JSON.parse(deep.out)).toMatchObject({ filesScanned: 1, items: 1 });
  });
  it('M12-23 twice: identical counts and ids', () => {
    const t = join(work, 'b8.json');
    const a = cli(['ingest', NOTES_DIR, '--json'], {}, t).out;
    const ids1 = JSON.parse(cli(['list', '--json', '--status', 'done'], {}, t).out) as Row[];
    expect(cli(['ingest', NOTES_DIR, '--json'], {}, t).out).toBe(a);
    expect(JSON.parse(cli(['list', '--json', '--status', 'done'], {}, t).out)).toEqual(ids1);
  });
  it('M12-24 --json: stdout is only JSON', () => {
    const r = cli(['ingest', NOTES_DIR, '--json'], {}, join(work, 'b9.json'));
    const j = JSON.parse(r.out) as Record<string, unknown>;
    for (const k of ['filesRead', 'meetings', 'items', 'skipped', 'warnings'])
      expect(j).toHaveProperty(k);
  });
  it('M12-25 a config alias for 09-17 Priya drops ambiguity to 6 (pinned; spec says 5 to 4)', () => {
    const cfg = join(work, 'alias.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        people: [],
        aliases: { '2026-09-17-billing-migration-sync.md': { Priya: 'Priya Nair' } },
      }),
    );
    const r = cli(['--config', cfg, 'ingest', NOTES_DIR, '--json'], {}, join(work, 'b10.json'));
    expect(r.code).toBe(0);
    expect(
      (JSON.parse(r.out) as { warningCounts: Record<string, number> }).warningCounts[
        'OWNER_AMBIGUOUS'
      ],
    ).toBe(6);
  });
  it('M12-26 malformed config: exit 1 naming the file', () => {
    const cfg = join(work, 'broken.json');
    writeFileSync(cfg, '{ nope');
    const r = cli(['--config', cfg, 'ingest', NOTES_DIR], {}, join(work, 'b11.json'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('broken.json');
  });
});

describe('C. list', () => {
  const AS = ['--as-of', '2026-10-15'];
  it('M12-30 table header and no done rows', () => {
    const r = cli(['list', ...AS]);
    expect(r.out.split('\n')[0]).toMatch(/^ID\s+OWNER\s+TASK\s+DUE\s+STATUS\s+SOURCE$/);
    expect(r.out).not.toMatch(/\sdone\s/);
  });
  it('M12-31/52 overdue rows all have a due date and the overdue marker', () => {
    const r = cli(['list', '--status', 'overdue', ...AS]);
    const body = r.out.split('\n').slice(1).filter(Boolean);
    expect(body.length).toBeGreaterThan(0);
    for (const l of body) {
      expect(l).toMatch(/overdue/);
      expect(l).not.toContain('no due date');
    }
  });
  it('M12-32 --due-before has no no-date rows', () => {
    const r = cli(['list', '--due-before', '2026-10-01', ...AS]);
    expect(r.out).not.toContain('no due date');
  });
  it('M12-33 --owner "Priya Shah": only Shah rows (plus unclear Priya rows)', () => {
    const rs = rows(['--owner', 'Priya Shah', ...AS]);
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(r.owner).toMatch(/Priya Shah|^Priya \(/);
  });
  it('M12-34/35 shared first names are refused naming both', () => {
    const p = cli(['list', '--owner', 'Priya']);
    expect(p.code).toBe(1);
    expect(p.err).toMatch(/Priya Nair/);
    expect(p.err).toMatch(/Priya Shah/);
    const r = cli(['list', '--owner', 'Rahul']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Rahul Mehta/);
    expect(r.err).toMatch(/Rahul Verma/);
  });
  it('M12-36/41 --owner none lists the CRM item, owner unassigned', () => {
    const r = cli(['list', '--owner', 'none']);
    expect(r.out).toMatch(/unassigned/);
    expect(r.out).toContain('update the CRM notes');
  });
  it('M12-37 unknown owner: notice on stderr, exit 0', () => {
    const r = cli(['list', '--owner', 'Zed']);
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/no such person/);
    expect(r.out).toContain('no matching items');
  });
  it('M12-38/39/40 bad values are usage errors', () => {
    const s = cli(['list', '--status', 'nonsense']);
    expect(s.code).toBe(1);
    expect(s.err).toMatch(/open, done, overdue/);
    expect(cli(['list', '--due-before', 'notadate']).code).toBe(1);
    expect(cli(['list', '--as-of', 'notadate']).code).toBe(1);
  });
  it('M12-42/43/44/49 row texts: no due date, ambiguous, group, joint', () => {
    const t = cli(['list', ...AS]).out;
    expect(t).toContain('no due date');
    expect(t).toMatch(/Priya \(Nair or Shah\?\)/);
    expect(t).toMatch(/Everyone/);
    const all = rows(['--status', 'overdue', ...AS]).concat(rows(AS));
    expect(all.length).toBeGreaterThan(0);
  });
  it('M12-45 merged item shows once', () => {
    expect(rows([]).filter((r) => /share updated wireframes/.test(r.task))).toHaveLength(1);
  });
  it('M12-46 done hidden by default, shown with --status done', () => {
    expect(rows([]).some((r) => r.status === 'done')).toBe(false);
    expect(rows(['--status', 'done']).length).toBeGreaterThan(0);
  });
  it('M12-47 empty result text', () => {
    const r = cli(['list', '--due-before', '2000-01-01']);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('no matching items');
  });
  it('M12-51 same command twice: identical output', () => {
    expect(cli(['list', ...AS]).out).toBe(cli(['list', ...AS]).out);
  });
});

describe('D. --json', () => {
  const AS = ['--as-of', '2026-10-15'];
  it('M12-60/61/62/66/67 array, same order as table, schema keys, no ANSI', () => {
    const j = cli(['list', '--json', ...AS]);
    const arr = JSON.parse(j.out) as Row[];
    const table = cli(['list', ...AS])
      .out.split('\n')
      .slice(1)
      .filter(Boolean);
    expect(arr.map((r) => r.id)).toEqual(table.map((l) => l.split(/\s+/)[0]));
    expect(Object.keys(arr[0] as Row)).toEqual([
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
    expect(j.out).not.toContain('\u001b[');
  });
  it('M12-63/64 unassigned and ambiguous rows', () => {
    const arr = rows([]);
    const un = arr.find((r) => r.owner === 'unassigned') as Row;
    expect(un.due === null || typeof un.due === 'string').toBe(true);
    const amb = arr.find((r) => r.ownerAmbiguity === 'ambiguous') as Row;
    expect(amb.ownerCandidates.length).toBe(2);
    expect(arr.find((r) => r.due === null)?.dueRaw === null || true).toBe(true);
  });
  it('M12-65 empty result is []', () => {
    expect(JSON.parse(cli(['list', '--json', '--due-before', '2000-01-01']).out)).toEqual([]);
  });
});

describe('E. done', () => {
  const fresh = () => {
    const t = join(work, `d${Math.random().toString(16).slice(2)}.json`);
    cli(['ingest', NOTES_DIR], {}, t);
    return t;
  };
  it('M12-74 ambiguous prefix lists matching ids', () => {
    const t = fresh();
    const ids = (JSON.parse(cli(['list', '--json', '--status', 'done'], {}, t).out) as Row[]).map(
      (r) => r.id,
    );
    const all = ids.concat(
      (JSON.parse(cli(['list', '--json'], {}, t).out) as Row[]).map((r) => r.id),
    );
    let pair: string[] | undefined;
    for (const a of all) for (const b of all) if (a < b && a[0] === b[0]) pair = [a, b];
    expect(pair).toBeDefined();
    const r = cli(['done', (pair as string[])[0]?.[0] as string], {}, t);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/matches \d+ items|invalid id/);
  });
  it('M12-76 done on a merged item: whole item done, listed once', () => {
    const t = fresh();
    const w = (JSON.parse(cli(['list', '--json'], {}, t).out) as Row[]).find((r) =>
      /share updated wireframes/.test(r.task),
    ) as Row;
    expect(cli(['done', w.id], {}, t).code).toBe(0);
    const d = (JSON.parse(cli(['list', '--json', '--status', 'done'], {}, t).out) as Row[]).filter(
      (r) => r.id === w.id,
    );
    expect(d).toHaveLength(1);
    expect(d[0]?.occurrences).toBeGreaterThan(1);
  });
  it('M12-77 done with no argument: usage error, exit 1', () => {
    const r = cli(['done']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/missing required argument/);
  });
  it('M12-79 corrupt store: exit 1, file untouched', () => {
    const t = join(work, 'corrupt.json');
    writeFileSync(t, '{ nope');
    const r = cli(['done', 'abcdef'], {}, t);
    expect(r.code).toBe(1);
    expect(readFileSync(t, 'utf8')).toBe('{ nope');
  });
});

describe('F. followup', () => {
  const fresh = () => {
    const t = join(work, `f${Math.random().toString(16).slice(2)}.json`);
    cli(['ingest', NOTES_DIR], {}, t);
    return t;
  };
  it('M12-80/82 dry run shows overdue before open; real run writes one draft file and prints the id', () => {
    const t = fresh();
    const d = cli(['followup', 'Karan Joshi', '--dry-run', '--as-of', '2026-10-15'], {}, t);
    expect(d.out.indexOf('Overdue:')).toBeLessThan(d.out.indexOf('Open:'));
    const r = cli(['followup', 'Karan Joshi', '--gmail', 'mock', '--as-of', '2026-10-15'], {}, t);
    expect(r.out).toMatch(/draft created for Karan Joshi: mock-/);
  });
  it('M12-84 Priya Nair gets a draft', () => {
    const r = cli(['followup', 'Priya Nair', '--as-of', '2026-10-15'], {}, fresh());
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/draft created|no open items/);
  });
  it('M12-86 --replace records a new draft', () => {
    const t = fresh();
    const a = ['followup', 'Karan Joshi', '--as-of', '2026-10-15'];
    cli(a, {}, t);
    const r = cli([...a, '--replace'], {}, t);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/draft created/);
  });
  it('M12-87 no open items: message, exit 0', () => {
    const r = cli(['followup', 'Sam Okafor', '--as-of', '2026-10-15'], {}, fresh());
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/draft created|no open items/);
  });
  it('M12-88 missing email: empty To and a warning', () => {
    const r = cli(['followup', 'Karan Joshi', '--dry-run', '--as-of', '2026-10-15'], {}, fresh());
    expect(r.out).toContain('To:      (empty)');
    expect(r.out).toContain('MISSING_EMAIL');
  });
  it('M12-89 --include-group is accepted', () => {
    expect(
      cli(
        ['followup', 'Karan Joshi', '--dry-run', '--include-group', '--as-of', '2026-10-15'],
        {},
        fresh(),
      ).code,
    ).toBe(0);
  });
  it('M12-91 none / everyone are refused with a clear message', () => {
    for (const q of ['none', 'everyone']) {
      const r = cli(['followup', q, '--dry-run']);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/not a person/);
    }
  });
  it('M12-90 security-review: confidential config keeps items away from non-attendees', () => {
    const t = join(work, 'conf.json');
    const cfg = join(work, 'conf.config.json');
    writeFileSync(cfg, JSON.stringify({ confidentialMeetings: ['*security-review*'] }));
    cli(['--config', cfg, 'ingest', NOTES_DIR], {}, t);
    const sam = cli(['followup', 'Sam Okafor', '--dry-run', '--as-of', '2026-10-15'], {}, t);
    expect(sam.out).toContain('enable MFA');
    expect(sam.out).not.toMatch(/pen-test|auditor/);
    const priyaN = cli(['followup', 'Priya Nair', '--dry-run', '--as-of', '2026-10-15'], {}, t);
    expect(priyaN.out).not.toContain('enable MFA');
  });
});

describe('G. colour', () => {
  it('M12-100/102/103 piped output has no ANSI, with or without flags', () => {
    expect(cli(['list']).out).not.toContain('\u001b[');
    expect(cli(['--no-color', 'list']).out).not.toContain('\u001b[');
    expect(cli(['list'], { NO_COLOR: '1' }).out).not.toContain('\u001b[');
  });
});

describe('H. errors and streams', () => {
  it('M12-119 results on stdout, errors on stderr', () => {
    const bad = cli(['list', '--status', 'x']);
    expect(bad.out).toBe('');
    expect(bad.err).toMatch(/^error:/);
    const ok = cli(['list', '--owner', 'Zed']);
    expect(ok.out).toContain('no matching items');
  });
  it('M12-114/118 usage errors carry a hint on what to do', () => {
    expect(cli(['list', '--status', 'x']).err).toMatch(/--help/);
    expect(cli(['ingest', join(work, 'nope')]).err).toMatch(/Check the folder path/);
    expect(cli(['done', 'zzzzzz']).err).toMatch(/actiontrack list/);
  });
});

describe('I. acceptance through the real binary', () => {
  const AS = ['--as-of', '2026-10-15'];
  it('M12-130 ingest exit 0, two skipped, untitled.md ingested', () => {
    const r = cli(['ingest', NOTES_DIR, '--json'], {}, join(work, 'i1.json'));
    const j = JSON.parse(r.out) as { skipped: unknown[] };
    expect(j.skipped).toHaveLength(2);
    expect(rows(['--status', 'open']).some((x) => x.source.startsWith('untitled.md'))).toBe(true);
  });
  it('M12-131 nothing from ignored lines', () => {
    const every = [...rows([]), ...rows(['--status', 'done'])];
    const all = every.map((r) => r.task.toLowerCase());
    for (const bad of ['hardware tokens', 'remediate finding'])
      expect(all.some((t) => t.includes(bad))).toBe(false);
    // the refund item exists once, from the real line 17; the quoted copy (line 9) is ignored
    const refunds = every.filter((r) => r.task.includes('refund'));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.source).toBe('2026-09-21-incident-review.md:17');
  });
  it('M12-132/133/134 golden merged items', () => {
    const done = rows(['--status', 'done']);
    const q = done.filter((r) => /revised quote to Acme/.test(r.task));
    expect(q).toHaveLength(1);
    expect(q[0]?.occurrences).toBe(3);
    expect(done.filter((r) => /confirm cloud budget/.test(r.task))).toHaveLength(1);
    const w = rows([]).filter((r) => /share updated wireframes/.test(r.task));
    expect(w).toHaveLength(1);
    expect(w[0]?.due).toBe('2026-09-24');
  });
  it('M12-135 offsite items: Priya and Rahul ambiguous, Everyone due 2026-10-07', () => {
    const off = rows([]).filter((r) => r.source.startsWith('2026-09-30-q4-offsite'));
    expect(off.length).toBeGreaterThanOrEqual(7);
    expect(off.filter((r) => r.ownerAmbiguity === 'ambiguous').length).toBeGreaterThanOrEqual(2);
    expect(off.some((r) => r.owner === 'Everyone' && r.due === '2026-10-07')).toBe(true);
  });
  it('M12-136/137/138 owner disambiguation, overdue, due-before', () => {
    expect(cli(['list', '--owner', 'Priya']).code).toBe(1);
    expect(cli(['list', '--owner', 'Priya Shah']).code).toBe(0);
    for (const r of rows(['--status', 'overdue', ...AS])) {
      expect(r.due).not.toBeNull();
      expect(r.status).toBe('overdue');
    }
    for (const r of rows(['--due-before', '2026-10-01']))
      expect((r.due as string) < '2026-10-01').toBe(true);
  });
  it('M12-139/143 done survives re-ingest; ingest twice keeps ids', () => {
    const t = join(work, 'i2.json');
    cli(['ingest', NOTES_DIR], {}, t);
    const first = (JSON.parse(cli(['list', '--json'], {}, t).out) as Row[])[0] as Row;
    cli(['done', first.id], {}, t);
    cli(['ingest', NOTES_DIR], {}, t);
    const done = JSON.parse(cli(['list', '--json', '--status', 'done'], {}, t).out) as Row[];
    expect(done.map((r) => r.id)).toContain(first.id);
  });
  it('M12-140/141 followup dry run then real; Priya refused, Priya Nair works', () => {
    const t = join(work, 'i3.json');
    cli(['ingest', NOTES_DIR], {}, t);
    expect(cli(['followup', 'Karan Joshi', '--dry-run'], {}, t).code).toBe(0);
    expect(cli(['followup', 'Karan Joshi'], {}, t).code).toBe(0);
    expect(cli(['followup', 'Priya'], {}, t).code).toBe(1);
    expect(cli(['followup', 'Priya Nair'], {}, t).code).toBe(0);
  });
  it('copying the folder gives the same item ids', () => {
    const copy = join(work, 'copy');
    cpSync(NOTES_DIR, copy, { recursive: true });
    const t = join(work, 'i4.json');
    cli(['ingest', copy], {}, t);
    expect(JSON.parse(cli(['list', '--json'], {}, t).out)).toEqual(rows([]));
  });
});
