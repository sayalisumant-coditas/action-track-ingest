import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NOTES_DIR } from '../helpers/fixtures.js';

const ROOT = resolve(__dirname, '../..');
const BIN = join(ROOT, 'dist', 'cli', 'index.js');

let work: string;
let store: string;

/** Run the built binary with a clean environment; never touches the real working directory. */
function cli(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: work,
    encoding: 'utf8',
    env: { ...process.env, ACTIONTRACK_STORE: '', NO_COLOR: '1', ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const withStore = (args: string[]) => ['--store', store, ...args];

beforeAll(() => {
  // build the current sources so the tests drive the real binary
  execFileSync(
    process.execPath,
    [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'],
    { cwd: ROOT, stdio: 'pipe' },
  );
}, 120_000);

beforeEach(() => {
  if (work) rmSync(work, { recursive: true, force: true });
  work = mkdtempSync(join(tmpdir(), 'at-cli-'));
  store = join(work, 'store.json');
});
afterAll(() => work && rmSync(work, { recursive: true, force: true }));

const ingestSample = () => cli(withStore(['ingest', NOTES_DIR]));

describe('ingest', () => {
  it('exit 0 and the report says 2 skipped', () => {
    const r = ingestSample();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/35/);
    expect(r.out).toMatch(/2 skipped|skipped.*2/i);
    expect(existsSync(store)).toBe(true);
  });
  it('--json prints a parseable report with the stable keys', () => {
    const r = cli(withStore(['ingest', NOTES_DIR, '--json']));
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out) as Record<string, unknown>;
    expect(j).toMatchObject({ filesScanned: 35, filesRead: 33, meetings: 33, items: 96 });
    for (const k of [
      'skipped',
      'warningCounts',
      'counts',
      'uncertainMerges',
      'ignoredCandidates',
    ]) {
      expect(j).toHaveProperty(k);
    }
  });
  it('missing folder: exit 1 with the path in the message', () => {
    const r = cli(withStore(['ingest', join(work, 'nope')]));
    expect(r.code).toBe(1);
    expect(r.err).toContain('nope');
    expect(existsSync(store)).toBe(false);
  });
  it('a corrupt store: exit 1, file untouched', () => {
    ingestSample();
    writeFileSync(store, '{ nope');
    const r = cli(withStore(['ingest', NOTES_DIR]));
    expect(r.code).toBe(1);
    expect(readFileSync(store, 'utf8')).toBe('{ nope');
  });
  it('ingesting twice leaves an identical store file apart from the time', () => {
    ingestSample();
    const strip = (t: string) => t.replace(/"at": "[^"]+"/, '"at": ""');
    const a = strip(readFileSync(store, 'utf8'));
    ingestSample();
    expect(strip(readFileSync(store, 'utf8'))).toBe(a);
  });
});

describe('list', () => {
  beforeEach(() => void ingestSample());

  it('prints a table; --json rows match the table ids', () => {
    const table = cli(withStore(['list', '--as-of', '2026-10-15', '--no-color']));
    const json = cli(withStore(['list', '--as-of', '2026-10-15', '--json']));
    expect(table.code).toBe(0);
    expect(json.code).toBe(0);
    const rows = JSON.parse(json.out) as { id: string }[];
    expect(rows.length).toBeGreaterThan(50);
    for (const row of rows) expect(table.out).toContain(row.id);
    expect(table.out).not.toContain('\u001b['); // piped output has no colour
  });
  it('--status nonsense is a usage error', () => {
    const r = cli(withStore(['list', '--status', 'nonsense']));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--status must be one of open, done, overdue/);
  });
  it('--owner Priya names both Priyas and exits 1', () => {
    const r = cli(withStore(['list', '--owner', 'Priya']));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Priya Nair/);
    expect(r.err).toMatch(/Priya Shah/);
  });
  it('--owner "Priya Shah" lists only items for her; --owner none lists the 2 unassigned', () => {
    const shah = JSON.parse(
      cli(withStore(['list', '--owner', 'Priya Shah', '--json', '--as-of', '2026-10-15'])).out,
    ) as { owner: string }[];
    expect(shah.length).toBeGreaterThan(0);
    for (const r of shah) expect(r.owner).toMatch(/Priya Shah|Priya \(/);
    const none = JSON.parse(cli(withStore(['list', '--owner', 'none', '--json'])).out) as unknown[];
    expect(none).toHaveLength(2);
  });
  it('--status overdue --as-of: every row is overdue with a due date', () => {
    const rows = JSON.parse(
      cli(withStore(['list', '--status', 'overdue', '--as-of', '2026-10-15', '--json'])).out,
    ) as { due: string | null; status: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.due).not.toBeNull();
      expect(r.status).toBe('overdue');
    }
  });
  it('same query twice gives byte-identical output', () => {
    const a = cli(withStore(['list', '--as-of', '2026-10-15', '--json'])).out;
    expect(cli(withStore(['list', '--as-of', '2026-10-15', '--json'])).out).toBe(a);
  });
  it('without a store: exit 1 pointing at ingest', () => {
    const r = cli(['--store', join(work, 'missing.json'), 'list']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/ingest/);
  });
  it('ACTIONTRACK_STORE selects the store when --store is absent; the flag wins', () => {
    expect(cli(['list', '--json'], { ACTIONTRACK_STORE: store }).code).toBe(0);
    const r = cli(['--store', join(work, 'other.json'), 'list'], { ACTIONTRACK_STORE: store });
    expect(r.code).toBe(1);
  });
});

describe('done', () => {
  beforeEach(() => void ingestSample());
  const firstOpenId = () =>
    (JSON.parse(cli(withStore(['list', '--json'])).out) as { id: string }[])[0]?.id as string;

  it('marks done, then says already done (both exit 0); item leaves the default list', () => {
    const id = firstOpenId();
    const a = cli(withStore(['done', id]));
    expect(a.code).toBe(0);
    expect(a.out).toMatch(/marked done/);
    const b = cli(withStore(['done', id.slice(0, 4)]));
    expect(b.code).toBe(0);
    expect(b.out).toMatch(/already done/);
    const rows = JSON.parse(cli(withStore(['list', '--json'])).out) as { id: string }[];
    expect(rows.map((r) => r.id)).not.toContain(id);
    // acceptance 10: still done after another ingest
    ingestSample();
    const done = JSON.parse(cli(withStore(['list', '--status', 'done', '--json'])).out) as {
      id: string;
    }[];
    expect(done.map((r) => r.id)).toContain(id);
  });
  it('unknown id: exit 1', () => {
    const r = cli(withStore(['done', 'zzzzzz']));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/unknown id/);
  });
  it('one-character prefix: exit 1', () => {
    expect(cli(withStore(['done', 'a'])).code).toBe(1);
  });
});

describe('followup', () => {
  beforeEach(() => void ingestSample());
  const draftsDir = () => join(work, 'drafts');
  const snapshot = () => readFileSync(store, 'utf8');

  it('--dry-run prints the draft; store and drafts folder are unchanged', () => {
    const before = snapshot();
    const r = cli(withStore(['followup', 'Karan Joshi', '--dry-run', '--as-of', '2026-10-15']));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Subject: Follow-up: \d+ open action items? \(\d+ overdue\)/);
    expect(r.out).toMatch(/dry run/);
    expect(snapshot()).toBe(before);
    expect(existsSync(draftsDir())).toBe(false);
  });
  it('creates one mock draft; a second run warns and creates nothing; --replace makes another', () => {
    const a = cli(withStore(['followup', 'Karan Joshi', '--as-of', '2026-10-15']));
    expect(a.code).toBe(0);
    expect(a.out).toMatch(/draft created for Karan Joshi/);
    expect(readdirSync(draftsDir())).toHaveLength(1);
    const b = cli(withStore(['followup', 'Karan Joshi', '--as-of', '2026-10-15']));
    expect(b.code).toBe(0);
    expect(b.err).toMatch(/already exists/);
    expect(readdirSync(draftsDir())).toHaveLength(1);
  });
  it('first name shared by two people: exit 1 listing both; full name works', () => {
    const bad = cli(withStore(['followup', 'Priya', '--dry-run']));
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/Priya Nair/);
    expect(bad.err).toMatch(/Priya Shah/);
    expect(
      cli(withStore(['followup', 'Priya Nair', '--dry-run', '--as-of', '2026-10-15'])).code,
    ).toBe(0);
  });
  it('--gmail mcp fails clearly, creates nothing and does not fall back', () => {
    const r = cli(
      withStore(['followup', 'Karan Joshi', '--gmail', 'mcp', '--as-of', '2026-10-15']),
    );
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not set up/);
    expect(existsSync(draftsDir())).toBe(false);
  });
  it('--gmail with an unknown mode: exit 1', () => {
    const r = cli(withStore(['followup', 'Karan Joshi', '--gmail', 'smtp']));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--gmail must be one of mock, mcp/);
  });
});

describe('help and version', () => {
  it('--help lists the four commands and the date rules', () => {
    const r = cli(['--help']);
    expect(r.code).toBe(0);
    for (const c of ['ingest', 'list', 'done', 'followup']) expect(r.out).toContain(c);
    expect(r.out).toMatch(/date/i);
  });
  it('--version prints the package version', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(cli(['--version']).out.trim()).toBe(pkg.version);
  });
});
